# 🌻 Gardenia

This project is designed to run on a Raspberry Pi with:

- [Raspberry camera](https://www.raspberrypi.com/documentation/accessories/camera.html)
- [Netatmo weather station](https://dev.netatmo.com/apidocumentation)
- [TP-link Tapo P100](https://www.tp-link.com/fr/home-networking/smart-plug/tapo-p100)

## Installation

```sh
# Perform upgrade
apt update
apt upgrade
apt autoremove
# Set wifi country
raspi-config
# Install RaspAP (say yes to all questions, no need for the vpn client though)
mv /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant.conf.bak
curl -sL https://install.raspap.com | bash
# Install camera
apt install -y python3-picamera2 --no-install-recommends
# Install tapo100 support
apt install python3-pip
pip install --break-system-packages git+https://github.com/almottier/TapoP100.git@main
# Install deno
curl -s https://gist.githubusercontent.com/LukeChannings/09d53f5c364391042186518c8598b85e/raw/ac8cd8c675b985edd4b3e16df63ffef14d1f0e24/deno_install.sh | sh
# Clone repository
git clone https://github.com/lowlighter/gardenia.git /
```
