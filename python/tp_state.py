import os
import json
from PyP100 import PyP100

p100 = PyP100.P100(os.environ["TP_IP"], os.environ["TP_USERNAME"], os.environ["TP_PASSWORD"])
print(json.dumps(p100.getDeviceInfo()))
