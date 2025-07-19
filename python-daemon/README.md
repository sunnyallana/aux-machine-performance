# Industrial IoT Signal Recorder Daemon

This Python daemon connects to PLC systems, reads sensor signals, processes production data, and stores it in MongoDB for the frontend application.

## Features

- **PLC Integration**: Connects to Siemens PLCs using SNAP7 protocol
- **Real-time Signal Processing**: Reads power and unit cycle sensors
- **Production Tracking**: Automatically counts units produced per hour
- **Database Storage**: Stores raw sensor data and processed production records
- **Configurable**: JSON-based configuration for easy deployment
- **Robust**: Automatic reconnection, error handling, and graceful shutdown

## Installation

### Prerequisites

- Python 3.8+
- MongoDB running locally or accessible via network
- SNAP7 library for PLC communication
- PLC with configured digital/analog I/O

### Quick Install

```bash
chmod +x install.sh
./install.sh
```

### Manual Installation

1. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install SNAP7 library:
```bash
# Ubuntu/Debian
sudo apt-get install libsnap7-1 libsnap7-dev

# CentOS/RHEL
sudo yum install snap7-devel
```

## Configuration

Edit `config.json` to match your setup:

```json
{
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
```

## Usage

### Running Manually

```bash
source venv/bin/activate
python signal_recorder.py
```

### Running as System Service

```bash
# Start service
sudo systemctl start iot-signal-recorder

# Enable auto-start on boot
sudo systemctl enable iot-signal-recorder

# Check status
sudo systemctl status iot-signal-recorder

# View logs
sudo journalctl -u iot-signal-recorder -f
```

## How It Works

### Signal Processing

1. **Power Sensors**: Reads analog values from PLC analog inputs
2. **Unit Cycle Sensors**: Reads digital signals from PLC digital inputs
3. **Edge Detection**: Detects rising edges on cycle signals to count units
4. **Hourly Aggregation**: Accumulates production data every hour

### Data Flow

```
PLC Sensors → Signal Recorder → MongoDB → Frontend Application
```

### Database Schema

The daemon interacts with these MongoDB collections:

- `sensorpinmappings`: Maps sensors to PLC pins
- `sensors`: Sensor configuration and metadata
- `machines`: Machine information
- `signaldatas`: Raw sensor readings
- `productionrecords`: Processed hourly production data

### Production Counting

- **Unit Cycle Sensors**: Count completed production cycles
- **Power Sensors**: Monitor machine power consumption
- **Hourly Updates**: Production records updated every hour
- **Real-time Storage**: Raw sensor data stored every 5 seconds

## Monitoring

### Log Files

- Application logs: `signal_recorder.log`
- System logs: `sudo journalctl -u iot-signal-recorder`

### Health Checks

The daemon logs connection status and sensor readings. Monitor for:

- PLC connection errors
- MongoDB connection issues
- Sensor reading failures
- Production count updates

## Troubleshooting

### Common Issues

1. **PLC Connection Failed**
   - Check IP address and network connectivity
   - Verify PLC rack/slot configuration
   - Ensure PLC allows external connections

2. **MongoDB Connection Error**
   - Verify MongoDB is running
   - Check connection string in config
   - Ensure database permissions

3. **No Sensor Data**
   - Verify sensor mappings in database
   - Check PLC pin configuration
   - Review sensor wiring

4. **Permission Denied**
   - Ensure iot user has proper permissions
   - Check file ownership: `sudo chown -R iot:iot .`

### Debug Mode

Run with debug logging:

```bash
# Edit config.json
{
  "logging": {
    "level": "DEBUG"
  }
}
```

## Integration with Frontend

The daemon stores data that the frontend consumes:

1. **Real-time Signals**: `signaldatas` collection
2. **Production Records**: `productionrecords` collection with hourly data
3. **Machine Status**: Inferred from sensor activity

The frontend API automatically reads this data to display:
- Production timelines
- Real-time machine status
- Historical production data
- OEE calculations

## Security Considerations

- Run daemon as dedicated `iot` user
- Restrict network access to PLC
- Use MongoDB authentication in production
- Monitor log files for security events
- Keep system and dependencies updated

## Performance

- **Sampling Rate**: 5-second intervals (configurable)
- **Memory Usage**: ~50MB typical
- **CPU Usage**: <5% on modern hardware
- **Network**: Minimal bandwidth requirements

## Extending the Daemon

### Adding New Sensor Types

1. Extend `SensorReading` dataclass
2. Add processing logic in `SignalProcessor`
3. Update `read_sensors()` method
4. Add database schema if needed

### Custom Processing

Modify `SignalProcessor` class to add:
- Quality calculations
- Predictive maintenance
- Custom alerts
- Integration with other systems