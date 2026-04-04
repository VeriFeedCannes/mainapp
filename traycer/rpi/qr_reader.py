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


def pause_camera():
    """Stop the camera stream to avoid V4L2 timeout during long NFC waits."""
    global _camera_mode
    if _camera is not None and _camera_mode is not None:
        try:
            _camera.stop()
        except Exception:
            pass
        _camera_mode = None
        print("[CAM] Camera paused")


def resume_camera():
    """Restart the camera in video mode after a pause."""
    if _camera is None:
        return
    _switch_to_video()
    print("[CAM] Camera resumed")


def _switch_to_video():
    """Switch camera to video config (fast, low-res for QR) with continuous autofocus."""
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

    # Enable continuous autofocus (Camera Module 3)
    try:
        from libcamera import controls
        _camera.set_controls({
            "AfMode": controls.AfModeEnum.Continuous,
            "AfRange": controls.AfRangeEnum.Full,
            "AfSpeed": controls.AfSpeedEnum.Fast,
        })
        print("[CAM] Autofocus: continuous / full range / fast")
    except Exception as e:
        print(f"[CAM] Autofocus not available: {e}")


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
    time.sleep(0.35)

    # One-shot friendly AF before we trigger a full cycle in _autofocus_still_and_settle
    try:
        from libcamera import controls
        _camera.set_controls({
            "AfMode": controls.AfModeEnum.Auto,
            "AfRange": controls.AfRangeEnum.Full,
            "AfSpeed": controls.AfSpeedEnum.Normal,
        })
    except Exception:
        pass


def _autofocus_still_and_settle():
    """
    After switching to still: run AF, then discard a few frames so AE/AWB settle.
    La caméra repasse souvent de « paused » à still : on refait une mise au point
    dédiée still, pas seulement l'AF continu du mode vidéo.
    """
    if _camera is None or _camera_mode != "still":
        return

    used_cycle = False
    try:
        af_cycle = getattr(_camera, "autofocus_cycle", None)
        if callable(af_cycle):
            print("[CAM] Autofocus cycle (still, wait)...")
            try:
                af_cycle(wait=True)
            except TypeError:
                af_cycle()
            used_cycle = True
            time.sleep(0.12)
    except Exception as e:
        print(f"[CAM] autofocus_cycle: {e}")

    if not used_cycle:
        try:
            from libcamera import controls
            _camera.set_controls({"AfTrigger": controls.AfTriggerEnum.Start})
        except Exception:
            time.sleep(1.0)
        else:
            deadline = time.time() + 2.5
            while time.time() < deadline:
                try:
                    md = _camera.capture_metadata()
                    if not isinstance(md, dict):
                        break
                    st = None
                    for k, v in md.items():
                        kn = str(k)
                        if kn.endswith("AfState") or "AfState" in kn:
                            st = v
                            break
                    if st is not None and (st == 2 or str(st).endswith("Focused")):
                        print("[CAM] Autofocus: focused (metadata)")
                        break
                except Exception:
                    break
                time.sleep(0.1)
            else:
                print("[CAM] Autofocus: best effort (no focus confirm)")
                time.sleep(0.35)

    # Discard frames — pipeline + exposure settle before final JPEG
    for _ in range(4):
        try:
            _camera.capture_array("main")
        except TypeError:
            _camera.capture_array()
        except Exception:
            break
    time.sleep(0.06)


def _try_decode_qr(frame):
    """Try to find a valid Traycer QR in a numpy frame."""
    import os

    img = Image.fromarray(frame)
    if img.mode == "RGBA":
        img = img.convert("RGB")

    decoded = pyzbar_decode(img)

    for obj in decoded:
        if obj.type == "QRCODE":
            try:
                raw = obj.data.decode("utf-8")
                data = json.loads(raw)
                if "s" in data:
                    os.makedirs("qr_debug", exist_ok=True)
                    img.save("qr_debug/qr_success.jpg")
                    print(f"[QR] ✅ Found QR code!")
                    print(f"[QR] Content: {raw}")
                    print(f"[QR] Image saved → qr_debug/qr_success.jpg")
                    return data
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    return None


def read_qr_camera():
    """Capture one video frame and try to decode a QR. Fast, non-blocking."""
    if _camera is None:
        init_camera()
    _switch_to_video()
    try:
        frame = _camera.capture_array()
    except Exception as e:
        print(f"[CAM] Capture error (recovering): {e}")
        pause_camera()
        time.sleep(0.3)
        resume_camera()
        return None
    return _try_decode_qr(frame)


def warmup_still():
    """
    Switch to still mode early so AE/AWB/AF can settle while
    waiting for the web user to press 'Done'.
    """
    if _camera is None:
        init_camera()
    print("[CAM] Warming up in still mode...")
    _switch_to_still()
    # Run a first AF trigger so the lens starts focusing during the wait
    try:
        from libcamera import controls
        _camera.set_controls({"AfTrigger": controls.AfTriggerEnum.Start})
        print("[CAM] AF trigger sent (warming up)")
    except Exception:
        pass


def snap_still(filename="deposit_photo.jpg"):
    """
    Quick capture when camera is already in still mode and warmed up.
    Re-triggers AF, discards a couple of frames, then captures. ~1-1.5s.
    Returns filename or None.
    """
    if _camera is None or _camera_mode != "still":
        print("[CAM] Not in still mode — falling back to full capture_photo")
        return capture_photo(filename)

    print("[CAM] Quick AF re-trigger + capture...")

    # Re-trigger AF for a sharp final shot
    try:
        from libcamera import controls
        _camera.set_controls({"AfTrigger": controls.AfTriggerEnum.Start})
    except Exception:
        pass

    # Wait for focus lock (max ~1.5s)
    focused = False
    deadline = time.time() + 1.5
    while time.time() < deadline and not focused:
        try:
            md = _camera.capture_metadata()
            if isinstance(md, dict):
                for k, v in md.items():
                    kn = str(k)
                    if kn.endswith("AfState") or "AfState" in kn:
                        if v == 2 or str(v).endswith("Focused"):
                            focused = True
                        break
        except Exception:
            break
        if not focused:
            time.sleep(0.08)

    print(f"[CAM] AF {'locked' if focused else 'best-effort'}")

    # Let the lens settle after AF lock — fixes blurry shots
    time.sleep(0.5)

    # Discard frames so AE/AWB use the settled focus distance
    for _ in range(3):
        try:
            _camera.capture_array("main")
        except TypeError:
            _camera.capture_array()
        except Exception:
            break

    _camera.capture_file(filename)
    print(f"[CAM] Photo saved: {filename}")
    return filename


def capture_photo(filename="deposit_photo.jpg"):
    """
    Full capture: switch to still, AF cycle, capture, switch back to video.
    Used as fallback when camera wasn't warmed up.
    """
    if _camera is None:
        print("[CAM] No camera — skipping photo")
        return None

    print("[CAM] Switching to still mode for photo...")
    _switch_to_still()
    _autofocus_still_and_settle()
    _camera.capture_file(filename)
    print(f"[CAM] Photo saved: {filename}")

    _switch_to_video()
    return filename
