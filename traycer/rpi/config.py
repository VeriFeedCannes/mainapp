"""
Traycer Station — Configuration

QR_MODE options:
  "manual"  → paste QR JSON in terminal (no camera needed)
  "file"    → read QR from an image file on disk
  "camera"  → live camera feed with pyzbar (requires picamera2)
"""

BACKEND_URL = "http://192.168.1.100:3000"   # PC IP running Next.js dev server
STATION_ID = "cannes-1"
STATION_SECRET = "dev-station-secret"

QR_MODE = "camera"  # "camera" | "manual" | "file"
QR_IMAGE_PATH = "qr_test.png"  # used only in "file" mode

NFC_TIMEOUT = 0.5       # seconds to wait per NFC poll
SESSION_TIMEOUT = 120    # seconds before borne gives up waiting for NFC
