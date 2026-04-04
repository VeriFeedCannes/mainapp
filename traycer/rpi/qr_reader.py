"""
Traycer Station — QR Reader + Photo Capture

Camera uses two configurations:
  - VIDEO config (640x480) for fast continuous QR scanning (~20fps)
  - STILL config (1640x1232) for high-res deposit photos

Modes:
  "manual"  → user pastes the QR JSON payload in the terminal
  "file"    → decode QR from an image file on disk (pyzbar)
  "camera"  → continuous video feed, scans every frame for QR
"""

import json
import time

from pyzbar.pyzbar import decode as pyzbar_decode
from PIL import Image


# ──────────────────────────────────────────────
# Manual mode
# ──────────────────────────────────────────────

def read_qr_manual():
    """Prompt the user to paste the QR payload JSON."""
    print()
    print("-" * 40)
    print("[QR] Mode manuel — colle le payload QR")
    print('[QR] (format: {"s":"trc_xxx","t":"cannes-1","a":"pickup","e":...})')
    print("[QR] ou tape 'q' pour quitter")
    print("-" * 40)

    raw = input("[QR] Payload > ").strip()
    if raw.lower() == "q":
        return None

    try:
        data = json.loads(raw)
        if "s" in data:
            print(f"[QR] Parsed session_id: {data['s']}")
            return data
        else:
            print("[QR] JSON valide mais pas de champ 's' (session_id)")
            return None
    except json.JSONDecodeError as e:
        print(f"[QR] Erreur JSON: {e}")
        return None


# ──────────────────────────────────────────────
# File mode
# ──────────────────────────────────────────────

def read_qr_file(image_path):
    """Decode a QR code from an image file."""
    try:
        img = Image.open(image_path)
        decoded = pyzbar_decode(img)
        for obj in decoded:
            if obj.type == "QRCODE":
                try:
                    data = json.loads(obj.data.decode("utf-8"))
                    if "s" in data:
                        print(f"[QR] Decoded from file: session_id={data['s']}")
                        return data
                except (json.JSONDecodeError, UnicodeDecodeError):
                    continue
        print(f"[QR] No valid QR found in {image_path}")
        return None
    except FileNotFoundError:
        print(f"[QR] File not found: {image_path}")
        return None
    except Exception as e:
        print(f"[QR] Error reading file: {e}")
        return None


# ──────────────────────────────────────────────
# Camera — dual config (video for QR, still for photos)
# ──────────────────────────────────────────────

_camera = None
_camera_mode = None  # "video" or "still"


def init_camera():
    """Initialize Picamera2 in video mode for fast QR scanning."""
    global _camera, _camera_mode
    if _camera is not None:
        return

    from picamera2 import Picamera2

    _camera = Picamera2()
    _switch_to_video()
    print("[CAM] Camera ready (video mode for QR scanning)")


def _switch_to_video():
    """Switch camera to video config (fast, low-res for QR)."""
    global _camera_mode
    if _camera_mode == "video":
        return
    if _camera_mode is not None:
        _camera.stop()
    config = _camera.create_video_configuration(main={"size": (640, 480)})
    _camera.configure(config)
    _camera.start()
    _camera_mode = "video"
    time.sleep(0.3)


def _switch_to_still():
    """Switch camera to still config (higher res for deposit photo)."""
    global _camera_mode
    if _camera_mode == "still":
        return
    if _camera_mode is not None:
        _camera.stop()
    config = _camera.create_still_configuration(main={"size": (1640, 1232)})
    _camera.configure(config)
    _camera.start()
    _camera_mode = "still"
    time.sleep(0.5)


def _try_decode_qr(frame):
    """Try to find a valid Traycer QR in a numpy frame."""
    img = Image.fromarray(frame)
    decoded = pyzbar_decode(img)
    for obj in decoded:
        if obj.type == "QRCODE":
            try:
                data = json.loads(obj.data.decode("utf-8"))
                if "s" in data:
                    return data
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    return None


def read_qr_camera():
    """Capture one video frame and try to decode a QR. Fast, non-blocking."""
    if _camera is None:
        init_camera()
    _switch_to_video()
    frame = _camera.capture_array()
    return _try_decode_qr(frame)


def capture_photo(filename="deposit_photo.jpg"):
    """
    Switch to still mode, capture a high-res photo, then switch back to video.
    Returns filename or None.
    """
    if _camera is None:
        print("[CAM] No camera — skipping photo")
        return None

    print("[CAM] Switching to still mode for photo...")
    _switch_to_still()
    _camera.capture_file(filename)
    print(f"[CAM] Photo saved: {filename}")

    _switch_to_video()
    return filename
