#!/bin/bash

# Industrial IoT Signal Recorder Daemon Installation Script

echo "Installing Industrial IoT Signal Recorder Daemon..."

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Install snap7 library (required for PLC communication)
echo "Installing snap7 library..."

# For Ubuntu/Debian
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y libsnap7-1 libsnap7-dev
fi

# For CentOS/RHEL
if command -v yum &> /dev/null; then
    sudo yum install -y snap7-devel
fi

# Create systemd service file
sudo tee /etc/systemd/system/iot-signal-recorder.service > /dev/null <<EOF
[Unit]
Description=Industrial IoT Signal Recorder Daemon
After=network.target mongodb.service

[Service]
Type=simple
User=iot
Group=iot
WorkingDirectory=$(pwd)
Environment=PATH=$(pwd)/venv/bin
ExecStart=$(pwd)/venv/bin/python signal_recorder.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create iot user if it doesn't exist
if ! id "iot" &>/dev/null; then
    sudo useradd -r -s /bin/false iot
fi

# Set permissions
sudo chown -R iot:iot .
sudo chmod +x signal_recorder.py

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable iot-signal-recorder.service

echo "Installation complete!"
echo "To start the daemon: sudo systemctl start iot-signal-recorder"
echo "To check status: sudo systemctl status iot-signal-recorder"
echo "To view logs: sudo journalctl -u iot-signal-recorder -f"