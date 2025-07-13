#!/usr/bin/env python3
"""
Industrial IoT Signal Recording Daemon

This daemon connects to PLC, reads sensor signals, processes them,
and stores production data in MongoDB for the frontend to display.
"""

import asyncio
import logging
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import signal
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

import pymongo
from pymongo import MongoClient
import requests
from snap7 import client as snap7_client
import schedule

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('signal_recorder.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class SensorReading:
    """Represents a sensor reading"""
    sensor_id: str
    machine_id: str
    value: float
    timestamp: datetime
    sensor_type: str

@dataclass
class ProductionData:
    """Represents hourly production data"""
    machine_id: str
    hour: int
    date: str
    units_produced: int
    power_consumption: float
    cycle_count: int
    timestamp: datetime

class PLCConnector:
    """Handles PLC connection and data reading"""
    
    def __init__(self, ip: str, rack: int = 0, slot: int = 1):
        self.ip = ip
        self.rack = rack
        self.slot = slot
        self.client = snap7_client.Client()
        self.connected = False
        
    async def connect(self) -> bool:
        """Connect to PLC"""
        try:
            self.client.connect(self.ip, self.rack, self.slot)
            self.connected = True
            logger.info(f"Connected to PLC at {self.ip}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to PLC: {e}")
            self.connected = False
            return False
    
    def disconnect(self):
        """Disconnect from PLC"""
        if self.connected:
            self.client.disconnect()
            self.connected = False
            logger.info("Disconnected from PLC")
    
    def read_digital_input(self, pin: str) -> bool:
        """Read digital input from PLC pin (e.g., 'DQ.0')"""
        try:
            if not self.connected:
                return False
                
            # Parse pin format DQ.X
            if not pin.startswith('DQ.'):
                raise ValueError(f"Invalid pin format: {pin}")
                
            pin_number = int(pin.split('.')[1])
            
            # Read from digital input area
            # This is a simplified example - adjust based on your PLC configuration
            data = self.client.db_read(1, 0, 1)  # DB1, start=0, size=1 byte
            
            # Extract bit from byte
            byte_value = data[0]
            bit_value = bool(byte_value & (1 << pin_number))
            
            return bit_value
            
        except Exception as e:
            logger.error(f"Error reading pin {pin}: {e}")
            return False
    
    def read_analog_input(self, address: int) -> float:
        """Read analog input from PLC"""
        try:
            if not self.connected:
                return 0.0
                
            # Read analog value - adjust based on your PLC configuration
            data = self.client.db_read(2, address, 2)  # DB2, 2 bytes for analog
            
            # Convert bytes to float (adjust conversion based on your PLC)
            value = int.from_bytes(data, byteorder='big', signed=False)
            return float(value)
            
        except Exception as e:
            logger.error(f"Error reading analog input {address}: {e}")
            return 0.0

class DatabaseManager:
    """Handles MongoDB operations"""
    
    def __init__(self, connection_string: str = "mongodb://localhost:27017/industrial_iot"):
        self.connection_string = connection_string
        self.client = None
        self.db = None
        
    def connect(self) -> bool:
        """Connect to MongoDB"""
        try:
            self.client = MongoClient(self.connection_string)
            self.db = self.client.get_default_database()
            
            # Test connection
            self.client.admin.command('ping')
            logger.info("Connected to MongoDB")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    def store_signal_data(self, reading: SensorReading):
        """Store sensor reading in database"""
        try:
            collection = self.db.signaldatas
            document = {
                'sensorId': reading.sensor_id,
                'machineId': reading.machine_id,
                'value': reading.value,
                'timestamp': reading.timestamp,
                'createdAt': reading.timestamp,
                'updatedAt': reading.timestamp
            }
            collection.insert_one(document)
            
        except Exception as e:
            logger.error(f"Error storing signal data: {e}")
    
    def get_sensor_mappings(self) -> List[Dict]:
        """Get sensor to pin mappings from database"""
        try:
            collection = self.db.sensorpinmappings
            mappings = list(collection.aggregate([
                {
                    '$lookup': {
                        'from': 'sensors',
                        'localField': 'sensorId',
                        'foreignField': '_id',
                        'as': 'sensor'
                    }
                },
                {
                    '$unwind': '$sensor'
                },
                {
                    '$lookup': {
                        'from': 'machines',
                        'localField': 'sensor.machineId',
                        'foreignField': '_id',
                        'as': 'machine'
                    }
                },
                {
                    '$unwind': '$machine'
                }
            ]))
            return mappings
            
        except Exception as e:
            logger.error(f"Error getting sensor mappings: {e}")
            return []
    
    def update_production_record(self, machine_id: str, hour: int, date: str, units_produced: int):
        """Update or create production record"""
        try:
            collection = self.db.productionrecords
            
            # Find existing record for this machine, date, and hour
            query = {
                'machineId': machine_id,
                'startTime': {
                    '$gte': datetime.strptime(f"{date} {hour:02d}:00:00", "%Y-%m-%d %H:%M:%S"),
                    '$lt': datetime.strptime(f"{date} {hour:02d}:59:59", "%Y-%m-%d %H:%M:%S")
                }
            }
            
            existing = collection.find_one(query)
            
            if existing:
                # Update existing record
                collection.update_one(
                    {'_id': existing['_id']},
                    {
                        '$set': {
                            'unitsProduced': units_produced,
                            'updatedAt': datetime.now()
                        },
                        '$push': {
                            'hourlyData': {
                                'hour': hour,
                                'unitsProduced': units_produced,
                                'defectiveUnits': 0,
                                'status': 'running'
                            }
                        }
                    }
                )
            else:
                # Create new record
                start_time = datetime.strptime(f"{date} {hour:02d}:00:00", "%Y-%m-%d %H:%M:%S")
                document = {
                    'machineId': machine_id,
                    'unitsProduced': units_produced,
                    'defectiveUnits': 0,
                    'startTime': start_time,
                    'hourlyData': [{
                        'hour': hour,
                        'unitsProduced': units_produced,
                        'defectiveUnits': 0,
                        'status': 'running'
                    }],
                    'createdAt': datetime.now(),
                    'updatedAt': datetime.now()
                }
                collection.insert_one(document)
                
        except Exception as e:
            logger.error(f"Error updating production record: {e}")

class SignalProcessor:
    """Processes sensor signals and calculates production metrics"""
    
    def __init__(self):
        self.power_readings: Dict[str, List[float]] = {}
        self.cycle_counts: Dict[str, int] = {}
        self.last_cycle_state: Dict[str, bool] = {}
        
    def process_power_signal(self, machine_id: str, power_value: float):
        """Process power sensor signal"""
        if machine_id not in self.power_readings:
            self.power_readings[machine_id] = []
            
        self.power_readings[machine_id].append(power_value)
        
        # Keep only last hour of readings (assuming 1 reading per minute)
        if len(self.power_readings[machine_id]) > 60:
            self.power_readings[machine_id] = self.power_readings[machine_id][-60:]
    
    def process_cycle_signal(self, machine_id: str, cycle_signal: bool):
        """Process unit cycle sensor signal"""
        if machine_id not in self.cycle_counts:
            self.cycle_counts[machine_id] = 0
            self.last_cycle_state[machine_id] = False
        
        # Detect rising edge (cycle completion)
        if cycle_signal and not self.last_cycle_state[machine_id]:
            self.cycle_counts[machine_id] += 1
            logger.debug(f"Unit produced on machine {machine_id}. Total: {self.cycle_counts[machine_id]}")
        
        self.last_cycle_state[machine_id] = cycle_signal
    
    def get_hourly_production(self, machine_id: str) -> int:
        """Get units produced in current hour"""
        return self.cycle_counts.get(machine_id, 0)
    
    def reset_hourly_counters(self):
        """Reset counters at the start of each hour"""
        self.cycle_counts.clear()
        logger.info("Hourly production counters reset")
    
    def get_average_power(self, machine_id: str) -> float:
        """Get average power consumption for machine"""
        readings = self.power_readings.get(machine_id, [])
        return sum(readings) / len(readings) if readings else 0.0

class SignalRecorderDaemon:
    """Main daemon class"""
    
    def __init__(self, config_file: str = "config.json"):
        self.config = self.load_config(config_file)
        self.plc = PLCConnector(
            ip=self.config['plc']['ip'],
            rack=self.config['plc']['rack'],
            slot=self.config['plc']['slot']
        )
        self.db = DatabaseManager(self.config['mongodb']['connection_string'])
        self.processor = SignalProcessor()
        self.running = False
        self.sensor_mappings = []
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
    def load_config(self, config_file: str) -> Dict:
        """Load configuration from JSON file"""
        default_config = {
            "plc": {
                "ip": "192.168.1.11",
                "rack": 0,
                "slot": 1
            },
            "mongodb": {
                "connection_string": "mongodb://localhost:27017/industrial_iot"
            },
            "sampling": {
                "interval_seconds": 5,
                "production_update_minutes": 60
            },
            "logging": {
                "level": "INFO"
            }
        }
        
        try:
            if Path(config_file).exists():
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    # Merge with defaults
                    for key, value in default_config.items():
                        if key not in config:
                            config[key] = value
                        elif isinstance(value, dict):
                            for subkey, subvalue in value.items():
                                if subkey not in config[key]:
                                    config[key][subkey] = subvalue
                return config
            else:
                logger.warning(f"Config file {config_file} not found, using defaults")
                return default_config
                
        except Exception as e:
            logger.error(f"Error loading config: {e}, using defaults")
            return default_config
    
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.running = False
    
    async def initialize(self) -> bool:
        """Initialize connections and load sensor mappings"""
        logger.info("Initializing Signal Recorder Daemon...")
        
        # Connect to database
        if not self.db.connect():
            return False
        
        # Connect to PLC
        if not await self.plc.connect():
            return False
        
        # Load sensor mappings
        self.sensor_mappings = self.db.get_sensor_mappings()
        logger.info(f"Loaded {len(self.sensor_mappings)} sensor mappings")
        
        # Schedule hourly production updates
        schedule.every().hour.at(":00").do(self.update_production_records)
        schedule.every().hour.at(":00").do(self.processor.reset_hourly_counters)
        
        return True
    
    async def read_sensors(self):
        """Read all configured sensors"""
        for mapping in self.sensor_mappings:
            try:
                sensor = mapping['sensor']
                machine = mapping['machine']
                pin_id = mapping['pinId']
                
                if sensor['sensorType'] == 'power':
                    # Read analog power value
                    power_value = self.plc.read_analog_input(0)  # Adjust address as needed
                    
                    # Store raw signal data
                    reading = SensorReading(
                        sensor_id=str(sensor['_id']),
                        machine_id=str(machine['_id']),
                        value=power_value,
                        timestamp=datetime.now(),
                        sensor_type='power'
                    )
                    self.db.store_signal_data(reading)
                    
                    # Process for production metrics
                    self.processor.process_power_signal(str(machine['_id']), power_value)
                    
                elif sensor['sensorType'] == 'unit-cycle':
                    # Read digital cycle signal
                    cycle_signal = self.plc.read_digital_input(pin_id)
                    
                    # Store raw signal data
                    reading = SensorReading(
                        sensor_id=str(sensor['_id']),
                        machine_id=str(machine['_id']),
                        value=1.0 if cycle_signal else 0.0,
                        timestamp=datetime.now(),
                        sensor_type='unit-cycle'
                    )
                    self.db.store_signal_data(reading)
                    
                    # Process for unit counting
                    self.processor.process_cycle_signal(str(machine['_id']), cycle_signal)
                    
            except Exception as e:
                logger.error(f"Error reading sensor {mapping.get('sensor', {}).get('name', 'unknown')}: {e}")
    
    def update_production_records(self):
        """Update production records with hourly data"""
        try:
            current_time = datetime.now()
            current_hour = current_time.hour
            current_date = current_time.strftime("%Y-%m-%d")
            
            # Get unique machine IDs from sensor mappings
            machine_ids = set()
            for mapping in self.sensor_mappings:
                machine_ids.add(str(mapping['machine']['_id']))
            
            # Update production record for each machine
            for machine_id in machine_ids:
                units_produced = self.processor.get_hourly_production(machine_id)
                if units_produced > 0:
                    self.db.update_production_record(
                        machine_id, 
                        current_hour, 
                        current_date, 
                        units_produced
                    )
                    logger.info(f"Updated production for machine {machine_id}: {units_produced} units")
                    
        except Exception as e:
            logger.error(f"Error updating production records: {e}")
    
    async def run(self):
        """Main daemon loop"""
        if not await self.initialize():
            logger.error("Failed to initialize daemon")
            return
        
        self.running = True
        logger.info("Signal Recorder Daemon started")
        
        try:
            while self.running:
                # Read sensors
                await self.read_sensors()
                
                # Run scheduled tasks
                schedule.run_pending()
                
                # Wait for next sampling interval
                await asyncio.sleep(self.config['sampling']['interval_seconds'])
                
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
        
        finally:
            await self.shutdown()
    
    async def shutdown(self):
        """Cleanup and shutdown"""
        logger.info("Shutting down Signal Recorder Daemon...")
        
        # Final production update
        self.update_production_records()
        
        # Disconnect from PLC and database
        self.plc.disconnect()
        self.db.disconnect()
        
        logger.info("Signal Recorder Daemon stopped")

def main():
    """Main entry point"""
    daemon = SignalRecorderDaemon()
    
    try:
        asyncio.run(daemon.run())
    except KeyboardInterrupt:
        logger.info("Daemon interrupted by user")
    except Exception as e:
        logger.error(f"Daemon crashed: {e}")

if __name__ == "__main__":
    main()