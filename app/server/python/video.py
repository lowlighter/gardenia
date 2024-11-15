#!/usr/bin/python3
import io
import os
import socketserver
from http import server
from threading import Condition
from io import BytesIO
from picamera2 import Picamera2
from picamera2.encoders import MJPEGEncoder
from picamera2.outputs import FileOutput

picam2 = None

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
    # Ping
    if self.path == '/ping':
      self.send_response(200)
      self.send_header('Content-Type', 'application/json')
      self.end_headers()
      if picam2 is not None:
        self.wfile.write(b'{"pong": true}')
      else:
        self.wfile.write(b'{"pong": false}')
      return

    # Capture
    if self.path == '/capture':
      try:
        if picam2 is None:
          raise Exception("Camera not initialized")
        with output.condition:
          output.condition.wait()
          frame = output.frame
        self.send_response(200)
        self.send_header('Content-Type', 'image/jpeg')
        self.send_header('Content-Length', len(frame))
        self.end_headers()
        self.wfile.write(frame)
      except Exception as e:
        print(e)
        pass
      return

    # Stream
    if self.path == '/stream':
      try:
        if picam2 is None:
          raise Exception("Camera not initialized")
        self.send_response(200)
        self.send_header('Age', 0)
        self.send_header('Cache-Control', 'no-cache, private')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
        self.end_headers()
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
      except Exception as e:
        print(e)
        pass
      return

    self.send_response(404)
    self.send_header('Content-Type', 'text/html')
    self.end_headers()
    self.wfile.write(b'Not Found')

class StreamingServer(socketserver.ThreadingMixIn, server.HTTPServer):
  allow_reuse_address = True
  daemon_threads = True

try:
  picam2 = Picamera2()
  picam2.configure(picam2.create_video_configuration(main={"size": (1920, 1080)},raw={"size":picam2.sensor_resolution}))
  output = StreamingOutput()
  picam2.start_recording(MJPEGEncoder(), FileOutput(output))
except Exception as e:
  print(e)

try:
  address = ('', int(os.environ["STREAM_PORT"]))
  server = StreamingServer(address, StreamingHandler)
  server.serve_forever()
finally:
  picam2.stop_recording()
