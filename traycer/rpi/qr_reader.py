"""
Traycer Station — QR Reader

Three modes:
  "manual"  → user pastes the QR JSON payload in the terminal
  "file"    → decode QR from an image file on disk (pyzbar)
  "camera"  → continuous camera feed, scans every frame for QR (picamera2 + pyzbar)

All modes return the parsed JSON dict or None.
"""

import json
import time


# ──────────────────────────────────────────────
# Manual mode
# ──────────────────────────────────────────────

def read_qr_manual():
    """Prompt the user to paste the QR payload JSON."""
    print()
    print("-" * 40)
    print("[QR] Mode manuel — colle le payload QR")
    print("[QR] (format: {\"s\":\"trc_xxx\",\"t\":\"cannes-1\",\"a\":\"pickup\",\"e\":...})")
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
        from pyzbar.pyzbar import decode
        from PIL import Image
    except ImportError:
        print("[QR] pyzbar ou Pillow manquant — pip install pyzbar Pillow")
        return None

    try:
        img = Image.open(image_path)
        decoded = decode(img)
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
# Camera mode — continuous feed
# ──────────────────────────────────────────────

_camera = None
_camera_started = False


def init_camera():
    """Start the Pi camera once. Call this before using camera mode."""
    global _camera, _camera_started
    if _camera_started:
        return

    from picamera2 import Picamera2

    _camera = Picamera2()
    config = _camera.create_still_configuration(main={"size": (640, 480)})
    _camera.configure(config)
    _camera.start()
    _camera_started = True
    time.sleep(1)  # warmup
    print("[CAM] Camera ready — continuous scanning")


def _decode_frame(frame):
    """Try to find a valid Traycer QR in a single frame."""
    from pyzbar.pyzbar import decode
    from PIL import Image

    img = Image.fromarray(frame)
    decoded = decode(img)

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
    """Capture one frame and try to decode a QR. Non-blocking, returns quickly."""
    if not _camera_started:
        init_camera()

    frame = _camera.capture_array()
    return _decode_frame(frame)


def scan_until_qr(timeout_seconds=300):
    """
    Continuously scan camera frames until a valid QR is found.
    Prints a dot every second to show it's alive.
    Returns parsed QR data or None on timeout.
    """
    if not _camera_started:
        init_camera()

    print(f"[CAM] Scanning for QR code (timeout {timeout_seconds}s)...")
    deadline = time.time() + timeout_seconds
    last_dot = time.time()
    frames = 0

    while time.time() < deadline:
        frame = _camera.capture_array()
        frames += 1
        result = _decode_frame(frame)

        if result:
            print(f"\n[CAM] ✅ QR found after {frames} frames — session: {result['s']}")
            return result

        # Progress indicator
        now = time.time()
        if now - last_dot > 2:
            elapsed = int(now - (deadline - timeout_seconds))
            print(f"  [scanning... {elapsed}s / {frames} frames]", end="\r")
            last_dot = now

        time.sleep(0.05)  # ~20 fps scan rate

    print(f"\n[CAM] Timeout after {frames} frames")
    return None


# ──────────────────────────────────────────────
# Photo capture (for deposit / waste analysis)
# ──────────────────────────────────────────────

def capture_photo(filename="deposit_photo.jpg"):
    """Capture a photo for waste analysis. Returns filename or None."""
    if not _camera_started:
        print("[CAM] No camera available — skipping photo capture")
        return None
    _camera.capture_file(filename)
    print(f"[CAM] Photo saved: {filename}")
    return filename
