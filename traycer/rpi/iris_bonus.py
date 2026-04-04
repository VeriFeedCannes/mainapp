"""
Traycer — Open-Iris Bonus Script (SEPARATE from main flow)

This script is NOT part of the NFC pickup/return loop.
It runs independently for demo purposes.

Usage:
  python iris_bonus.py enroll <image_path> <wallet>
  python iris_bonus.py match <image_path> <wallet>

What it does:
  - Sends an iris image to the backend
  - Backend runs open-iris for template extraction/matching
  - Returns result for display

Note: open-iris is too heavy for RPi (needs PyTorch + GPU).
This script just captures/sends the image.
The actual processing happens on the backend or a GPU server.
"""

import sys
import base64
import requests
from config import BACKEND_URL, STATION_SECRET

HEADERS = {
    "Content-Type": "application/json",
    "X-Station-Secret": STATION_SECRET,
}


def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def enroll(image_path, wallet):
    print(f"[IRIS] Enrolling iris for wallet {wallet}...")
    print(f"[IRIS] Image: {image_path}")

    b64 = encode_image(image_path)
    print(f"[IRIS] Encoded ({len(b64)} chars)")

    try:
        res = requests.post(
            f"{BACKEND_URL}/api/iris/enroll",
            json={"image_base64": b64, "wallet": wallet},
            headers=HEADERS,
            timeout=30,
        )
        data = res.json()
        print(f"[IRIS] Response: {data}")

        if data.get("status") == "enrolled":
            print("[IRIS] ✅ Iris enrolled successfully")
        else:
            print(f"[IRIS] ⚠️  {data.get('error', 'Unknown response')}")

        return data
    except Exception as e:
        print(f"[IRIS] ❌ Error: {e}")
        return None


def match(image_path, wallet):
    print(f"[IRIS] Matching iris for wallet {wallet}...")
    print(f"[IRIS] Image: {image_path}")

    b64 = encode_image(image_path)

    try:
        res = requests.post(
            f"{BACKEND_URL}/api/iris/match",
            json={"image_base64": b64, "wallet": wallet},
            headers=HEADERS,
            timeout=30,
        )
        data = res.json()
        print(f"[IRIS] Response: {data}")

        if data.get("match"):
            print(f"[IRIS] ✅ Iris matched (score: {data.get('score', '?')})")
        else:
            print("[IRIS] ❌ No match")

        return data
    except Exception as e:
        print(f"[IRIS] ❌ Error: {e}")
        return None


def main():
    if len(sys.argv) < 4:
        print("Usage:")
        print("  python iris_bonus.py enroll <image_path> <wallet>")
        print("  python iris_bonus.py match <image_path> <wallet>")
        sys.exit(1)

    action = sys.argv[1]
    image_path = sys.argv[2]
    wallet = sys.argv[3]

    if action == "enroll":
        enroll(image_path, wallet)
    elif action == "match":
        match(image_path, wallet)
    else:
        print(f"Unknown action: {action}")
        print("Use 'enroll' or 'match'")


if __name__ == "__main__":
    main()
