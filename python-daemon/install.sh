#!/bin/bash

# Pin Signal Daemon Installation Script

echo "Installing Pin Signal Daemon..."

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Create systemd service file
sudo tee /etc/systemd/system/pin-signal-daemon.service > /dev/null <<EOF
[Unit]
Description=Industrial IoT Pin Signal Daemon
After=network.target

[Service]
Type=simple
User=iot
Group=iot
WorkingDirectory=$(pwd)
Environment=PATH=$(pwd)/venv/bin
ExecStart=$(pwd)/venv/bin/python signal_daemon.py
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
sudo chmod +x signal_daemon.py

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable pin-signal-daemon.service

echo "Installation complete!"
echo "To start the daemon: sudo systemctl start pin-signal-daemon"
echo "To check status: sudo systemctl status pin-signal-daemon"
echo "To view logs: sudo journalctl -u pin-signal-daemon -f"