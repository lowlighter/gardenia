import requests
import RPi.GPIO as GPIO
from jsonc_parser.parser import JsoncParser

config = JsoncParser.parse_file("../settings.jsonc")
port = config["port"]
token = config["buttons"]["token"]
endpoint = f"http://0.0.0.0:{port}/api/buttons"
headers = {"Content-Type": "application/json"}
auth = ("buttons", token)

GPIO.setmode(GPIO.BOARD)
for button in config["buttons"]["list"]:
  GPIO.setup(button["pin"], GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

print(f"waiting for button events to forward to {endpoint}")
while True:
  for button in config["buttons"]["list"]:
    if GPIO.input(button["pin"]) == GPIO.HIGH:
      data = {"pin": button["pin"]}
      response = requests.post(endpoint, headers=headers, auth=auth, json=data)
      print(response.json())
