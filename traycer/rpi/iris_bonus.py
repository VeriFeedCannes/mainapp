"""
Traycer — Open-Iris Bonus (SEPARATE from main NFC flow)

Uses get_tpl.py locally for iris template extraction.
Optionally sends results to the backend for display in the Mini App.

Usage:
  python iris_bonus.py enroll <image_path> [wallet]
  python iris_bonus.py capture [wallet]

Commands:
  enroll   — process an existing iris image file
  capture  — take a photo with the Pi camera, then process it

The script never interferes with the main Traycer station loop.
Run it in a separate terminal.
"""

import sys
import os
import base64
import json
import time
import requests
from pathlib import Path
from config import BACKEND_URL, STATION_SECRET

HEADERS = {
    "Content-Type": "application/json",
    "X-Station-Secret": STATION_SECRET,
}


def run_open_iris(image_path, output_dir="iris_outputs", eye_side="right"):
    """Run open-iris locally via get_tpl.py and return output paths."""
    from get_tpl import save_iris_outputs

    print(f"[IRIS] Processing {image_path} with open-iris...")
    t0 = time.time()

    results = save_iris_outputs(
        image_path=image_path,
        output_dir=output_dir,
        eye_side=eye_side,
        template_index=0,
    )

    elapsed = time.time() - t0
    print(f"[IRIS] Done in {elapsed:.1f}s")
    print(f"[IRIS] Segmentation: {results['segmentation_path']}")
    print(f"[IRIS] Template:     {results['template_pair_path']}")

    return results


def send_to_backend(wallet, results):
    """Send iris outputs to the backend for storage/display."""
    if not wallet:
        print("[IRIS] No wallet specified — skipping backend upload")
        return None

    payload = {"wallet": wallet, "outputs": {}}

    for key in ["segmentation_path", "template_pair_path", "mask_real_path"]:
        path = results.get(key)
        if path and os.path.exists(path):
            with open(path, "rb") as f:
                payload["outputs"][key] = base64.b64encode(f.read()).decode("utf-8")

    try:
        res = requests.post(
            f"{BACKEND_URL}/api/iris/enroll",
            json=payload,
            headers=HEADERS,
            timeout=30,
        )
        data = res.json()
        print(f"[IRIS] Backend response: {json.dumps(data, indent=2)[:200]}")
        return data
    except Exception as e:
        print(f"[IRIS] Backend upload failed: {e}")
        return None


def capture_iris_photo(filename="iris_capture.png"):
    """Take a photo with the Pi camera for iris enrollment."""
    try:
        from picamera2 import Picamera2

        cam = Picamera2()
        config = cam.create_still_configuration(main={"size": (1640, 1232)})
        cam.configure(config)
        cam.start()
        time.sleep(1)
        cam.capture_file(filename)
        cam.stop()
        cam.close()
        print(f"[IRIS] Photo captured: {filename}")
        return filename
    except Exception as e:
        print(f"[IRIS] Camera capture failed: {e}")
        return None


def cmd_enroll(image_path, wallet=None):
    """Process an existing image file."""
    if not os.path.exists(image_path):
        print(f"[IRIS] File not found: {image_path}")
        return

    ts = int(time.time())
    output_dir = f"iris_outputs_{ts}"
    results = run_open_iris(image_path, output_dir)

    print()
    print("=" * 40)
    print("  IRIS ENROLLMENT RESULTS")
    print("=" * 40)
    for key, path in results.items():
        exists = "✅" if os.path.exists(path) else "❌"
        print(f"  {exists} {key}: {path}")
    print("=" * 40)

    if wallet:
        send_to_backend(wallet, results)


def cmd_capture(wallet=None):
    """Take a photo then process it."""
    ts = int(time.time())
    photo = capture_iris_photo(f"iris_capture_{ts}.png")
    if not photo:
        return

    cmd_enroll(photo, wallet)


def main():
    if len(sys.argv) < 2:
        print("Traycer Iris Bonus — open-iris enrollment")
        print()
        print("Usage:")
        print("  python iris_bonus.py enroll <image_path> [wallet]")
        print("  python iris_bonus.py capture [wallet]")
        print()
        print("Examples:")
        print("  python iris_bonus.py enroll sample_ir_image.png")
        print("  python iris_bonus.py enroll eye.png 0xABC123")
        print("  python iris_bonus.py capture 0xABC123")
        sys.exit(0)

    action = sys.argv[1]

    if action == "enroll":
        if len(sys.argv) < 3:
            print("Usage: python iris_bonus.py enroll <image_path> [wallet]")
            sys.exit(1)
        image_path = sys.argv[2]
        wallet = sys.argv[3] if len(sys.argv) > 3 else None
        cmd_enroll(image_path, wallet)

    elif action == "capture":
        wallet = sys.argv[2] if len(sys.argv) > 2 else None
        cmd_capture(wallet)

    else:
        print(f"Unknown action: {action}")
        print("Use 'enroll' or 'capture'")


if __name__ == "__main__":
    main()
