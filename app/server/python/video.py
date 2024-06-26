#!/usr/bin/python3
import io
import os
import socketserver
from http import server
from threading import Condition
from picamera2 import Picamera2
from picamera2.encoders import MJPEGEncoder
from picamera2.outputs import FileOutput

class StreamingOutput(io.BufferedIOBase):
  def __init__(self):
    self.frame = None
    self.condition = Condition()

  def write(self, buf):
    with self.condition:
      self.frame = buf
      self.condition.notify_all()

class StreamingHandler(server.BaseHTTPRequestHandler):
  def do_GET(self):
    if self.path == '/capture':
      self.send_response(200)
      self.send_header('Content-Type', 'image/png')
      picam2.capture_file("/tmp/capture.png")
      with open("/tmp/capture.png", "rb") as f:
        self.send_header('Content-Length', os.fstat(f.fileno()).st_size)
        self.end_headers()
        self.wfile.write(f.read())
      f.close()
      try:
        os.remove("/tmp/capture.png")
      except:
        pass
      return
    self.send_response(200)
    self.send_header('Age', 0)
    self.send_header('Cache-Control', 'no-cache, private')
    self.send_header('Pragma', 'no-cache')
    self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
    self.end_headers()
    try:
      while True:
        with output.condition:
          output.condition.wait()
          frame = output.frame
        self.wfile.write(b'--FRAME\r\n')
        self.send_header('Content-Type', 'image/jpeg')
        self.send_header('Content-Length', len(frame))
        self.end_headers()
        self.wfile.write(frame)
        self.wfile.write(b'\r\n')
    except:
      pass

class StreamingServer(socketserver.ThreadingMixIn, server.HTTPServer):
  allow_reuse_address = True
  daemon_threads = True

picam2 = Picamera2()
picam2.configure(picam2.create_video_configuration(main={"size": (1920, 1080)},raw={"size":picam2.sensor_resolution}))
output = StreamingOutput()
picam2.start_recording(MJPEGEncoder(), FileOutput(output))

try:
  address = ('', int(os.environ["STREAM_PORT"]))
  server = StreamingServer(address, StreamingHandler)
  server.serve_forever()
finally:
  picam2.stop_recording()
