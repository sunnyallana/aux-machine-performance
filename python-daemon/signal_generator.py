#!/usr/bin/env python3
"""
Real-time Signal Generator Daemon

Generates random digital signals and sends them to the backend API
to simulate PLC sensor data for real-time production monitoring.
"""

import asyncio
import logging
import json
import time
import random
from datetime import datetime
from typing import Dict, List
import signal
import sys
import requests
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('signal_generator.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class SignalGenerator:
    """Generates and sends random digital signals to backend"""
    
    def __init__(self, config_file: str = "config.json"):
        self.config = self.load_config(config_file)
        self.running = False
        self.pin_states = {}  # Track current state of each pin
        self.last_cycle_times = {}  # Track last cycle time for each pin
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
    def load_config(self, config_file: str) -> Dict:
        """Load configuration from JSON file"""
        default_config = {
            "backend": {
                "url": "http://localhost:3001/api",
                "timeout": 5
            },
            "pins": {
                "available": ["DQ.0", "DQ.1", "DQ.2", "DQ.3", "DQ.4", "DQ.5", "DQ.6", "DQ.7"],
                "cycle_probability": 0.1,  # 10% chance per interval
                "power_variation": 0.3     # 30% variation in power readings
            },
            "timing": {
                "interval_seconds": 2,
                "cycle_duration_ms": 500
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
    
    def generate_random_byte(self) -> str:
        """Generate a random 8-bit byte as binary string"""
        byte_value = random.randint(0, 255)
        return format(byte_value, '08b')
    
    def get_active_pins(self, byte_string: str) -> List[Dict]:
        """Extract active pins from byte string"""
        active_pins = []
        available_pins = self.config['pins']['available']
        
        for i, bit in enumerate(byte_string):
            if bit == '1' and i < len(available_pins):
                pin_id = available_pins[i]
                active_pins.append({
                    'pin': pin_id,
                    'value': 1,
                    'timestamp': datetime.now().isoformat()
                })
                
        return active_pins
    
    def simulate_realistic_cycles(self) -> List[Dict]:
        """Generate more realistic production cycles"""
        signals = []
        current_time = datetime.now()
        
        # Get available pins from backend (simulated)
        available_pins = self.config['pins']['available'][:4]  # Use first 4 pins
        
        for pin_id in available_pins:
            # Initialize pin state if not exists
            if pin_id not in self.pin_states:
                self.pin_states[pin_id] = False
                self.last_cycle_times[pin_id] = current_time
            
            # Determine if this pin should cycle
            time_since_last = (current_time - self.last_cycle_times[pin_id]).total_seconds()
            
            # Different cycle patterns for different pins
            if pin_id == "DQ.0":  # Fast production machine
                cycle_chance = 0.3 if time_since_last > 3 else 0.1
            elif pin_id == "DQ.1":  # Medium production machine  
                cycle_chance = 0.2 if time_since_last > 5 else 0.05
            elif pin_id == "DQ.2":  # Slow production machine
                cycle_chance = 0.15 if time_since_last > 8 else 0.03
            else:  # Power sensor (more frequent)
                cycle_chance = 0.4
            
            # Generate signal
            should_activate = random.random() < cycle_chance
            
            if should_activate:
                signals.append({
                    'pin': pin_id,
                    'value': 1,
                    'timestamp': current_time.isoformat()
                })
                self.pin_states[pin_id] = True
                self.last_cycle_times[pin_id] = current_time
                
                logger.debug(f"Generated signal for {pin_id}")
            
            # Sometimes send 0 to show pin going low
            elif self.pin_states[pin_id] and random.random() < 0.3:
                signals.append({
                    'pin': pin_id,
                    'value': 0,
                    'timestamp': current_time.isoformat()
                })
                self.pin_states[pin_id] = False
        
        return signals
    
    async def send_signals_to_backend(self, signals: List[Dict]):
        """Send signals to backend API"""
        if not signals:
            return
            
        backend_url = f"{self.config['backend']['url']}/signals/batch"
        
        try:
            # Prepare payload
            payload = {
                'signals': signals,
                'source': 'signal_generator',
                'timestamp': datetime.now().isoformat()
            }
            
            # Send to backend
            response = requests.post(
                backend_url,
                json=payload,
                timeout=self.config['backend']['timeout']
            )
            
            if response.status_code == 201:
                logger.info(f"Successfully sent {len(signals)} signals to backend")
                for signal_data in signals:
                    logger.debug(f"  {signal_data['pin']}: {signal_data['value']}")
            else:
                logger.error(f"Backend responded with status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send signals to backend: {e}")
        except Exception as e:
            logger.error(f"Unexpected error sending signals: {e}")
    
    async def run(self):
        """Main daemon loop"""
        logger.info("Starting Signal Generator Daemon...")
        logger.info(f"Backend URL: {self.config['backend']['url']}")
        logger.info(f"Signal interval: {self.config['timing']['interval_seconds']} seconds")
        
        self.running = True
        
        try:
            while self.running:
                # Generate realistic signals
                signals = self.simulate_realistic_cycles()
                
                # Send to backend if we have signals
                if signals:
                    await self.send_signals_to_backend(signals)
                
                # Wait for next interval
                await asyncio.sleep(self.config['timing']['interval_seconds'])
                
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
        
        finally:
            await self.shutdown()
    
    async def shutdown(self):
        """Cleanup and shutdown"""
        logger.info("Shutting down Signal Generator Daemon...")
        logger.info("Signal Generator Daemon stopped")

def main():
    """Main entry point"""
    daemon = SignalGenerator()
    
    try:
        asyncio.run(daemon.run())
    except KeyboardInterrupt:
        logger.info("Daemon interrupted by user")
    except Exception as e:
        logger.error(f"Daemon crashed: {e}")

if __name__ == "__main__":
    main()