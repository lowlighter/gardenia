# 🌻 Gardenia

Gardenia is a greenhouse automation system designed to run on a Raspberry Pi. It collects data from various sensors and modules, and can automate actions such as watering, heating and taking pictures
based on conditions.

This project was done as a volunteer for a high school in France.

## Requirements

This project is designed to run on a Raspberry Pi with:

- [Raspberry camera](https://www.raspberrypi.com/documentation/accessories/camera.html)
- [Netatmo weather station](https://dev.netatmo.com/apidocumentation) and its modules
- [TP-link Tapo P100](https://www.tp-link.com/fr/home-networking/smart-plug/tapo-p100)

A TP-link Tapo account and a Netatmo account are required to use this project. An additional Wifi dongle is required to create a hotspot if a separate network is wanted for modules.

## Features

- Data graphs
- Manage automation targets and rules
- Camera stream and pictures
- History
- System and user management

## Installation

Use [Raspberry Pi imager](https://www.raspberrypi.com/software) to install Raspbian Lite.

Open a shell (using SSH or directly on the Pi) and run the following commands:

```sh
# Perform upgrade
apt update
apt upgrade -y
apt autoremove -y

# Install pycamera2
apt install -y git python3-picamera2 python3-pip
python3 -c 'import picamera2;print(picamera2)'

# Install pyp100
pip install git+https://github.com/almottier/TapoP100.git@main --break-system-packages
python3 -c 'import PyP100;print(PyP100)'

# Install deno
curl -fsSL https://deno.land/install.sh | sh
echo 'export DENO_INSTALL="/root/.deno"' >> $HOME/.bashrc
echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> $HOME/.bashrc
source $HOME/.bashrc
deno --version

# Set wifi country
raspi-config nonint do_wifi_country FR

# Enable and configure hotspot
nmcli device wifi hotspot ssid raspi password hotspot_password ifname wlan0
nmcli connection down Hotspot
nmcli connection modify Hotspot ipv4.addresses 192.168.200.1/24
nmcli connection up Hotspot

# Install gardenia services
mkdir /gardenia
git clone https://github.com/lowlighter/gardenia.git /gardenia
cp /gardenia/app/server/gardenia_app.service /etc/systemd/system/gardenia_app.service
cp /gardenia/app/server/gardenia_ctl.service /etc/systemd/system/gardenia_ctl.service
systemctl daemon-reload
```
