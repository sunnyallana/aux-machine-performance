import snap7
from snap7.util import get_bool

plc = snap7.client.Client()
plc.connect('192.168.0.1', 0, 1)

from snap7.client import Area


data = plc.read_area(Area.PA, 0, 0, 1)

while True:
    q00 = get_bool(data, 0, 0)
    print("Q0.0:", "ON" if q00 else "OFF")
