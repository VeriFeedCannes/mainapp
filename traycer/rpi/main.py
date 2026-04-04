"""
Traycer Station — Main Loop

State machine:
  IDLE → scan QR (manual/file/camera continuous)
       → also poll NFC for spontaneous tray returns

  QR found → validate session → wait NFC (binding mode) → complete → IDLE
  NFC without QR → check if associated → if yes: return flow → IDLE
                                        → if no: ignore silently

Usage:
  python main.py              # uses QR_MODE from config.py
  python main.py --qr manual  # override: paste QR in terminal
  python main.py --qr file    # override: read QR from image file
  python main.py --qr camera  # override: live camera feed
"""

import sys
import time
from config import (
    BACKEND_URL,
    STATION_ID,
    QR_MODE,
    QR_IMAGE_PATH,
    SESSION_TIMEOUT,
    NFC_TIMEOUT,
)
from nfc_reader import init_nfc, read_uid, wait_for_tag, wait_for_removal
from qr_reader import read_qr_manual, read_qr_file, read_qr_camera, init_camera, capture_photo
from backend_client import validate_session, complete_session, deposit_return


# ──────────────────────────────────────────
# Parse CLI args
# ──────────────────────────────────────────
qr_mode = QR_MODE
for i, arg in enumerate(sys.argv):
    if arg == "--qr" and i + 1 < len(sys.argv):
        qr_mode = sys.argv[i + 1]

# Cooldown: avoid re-checking the same NFC tag repeatedly
_last_seen_uid = None
_last_seen_time = 0
NFC_COOLDOWN = 5  # seconds


def banner():
    print()
    print("=" * 50)
    print("  TRAYCER STATION")
    print(f"  Station : {STATION_ID}")
    print(f"  Backend : {BACKEND_URL}")
    print(f"  QR mode : {qr_mode}")
    print("=" * 50)
    print()


def is_on_cooldown(uid):
    """Check if we recently saw this UID (avoid spamming the API)."""
    global _last_seen_uid, _last_seen_time
    now = time.time()
    if uid == _last_seen_uid and (now - _last_seen_time) < NFC_COOLDOWN:
        return True
    _last_seen_uid = uid
    _last_seen_time = now
    return False


# ──────────────────────────────────────────
# Flow handlers
# ──────────────────────────────────────────

def handle_pickup_flow(qr_data):
    """
    QR scanned → validate → NFC binding mode → complete.
    In this mode, ANY tag placed on the reader gets bound.
    """
    session_id = qr_data["s"]
    action = qr_data.get("a", "pickup")

    print(f"\n{'─' * 40}")
    print(f"[FLOW] QR scanned — session: {session_id} / action: {action}")

    # Step 1: Validate session
    session_data = validate_session(session_id)
    if not session_data:
        print("[FLOW] Session invalid or expired. Back to idle.")
        return

    wallet = session_data.get("wallet", "?")
    print(f"[FLOW] Session valid for wallet {wallet}")
    print()
    print("  ┌─────────────────────────────────┐")
    print("  │   Place the tray on the reader   │")
    print("  └─────────────────────────────────┘")
    print()

    # Step 2: Wait for NFC (binding mode — any tag is accepted)
    uid = wait_for_tag(timeout_seconds=SESSION_TIMEOUT)
    if not uid:
        print("[FLOW] Timeout — no tray detected. Back to idle.")
        return

    # Step 3: Complete session (bind tag to wallet)
    result = complete_session(session_id, uid)
    if result:
        print(f"[FLOW] ✅ Tray {uid} linked to {wallet}")
    else:
        print(f"[FLOW] ❌ Failed to complete session")

    print("[FLOW] Remove the tray from the reader...")
    wait_for_removal()
    print(f"{'─' * 40}\n")


def try_return(nfc_uid):
    """
    NFC detected without active QR session.
    Ask the backend if this tag is associated.
    - If associated → return flow (photo + score)
    - If not associated → silent ignore
    Returns True if a real return happened, False otherwise.
    """
    if is_on_cooldown(nfc_uid):
        return False

    photo_path = None
    if qr_mode == "camera":
        ts = int(time.time())
        photo_path = capture_photo(f"return_{nfc_uid.replace(':', '')}_{ts}.jpg")

    result = deposit_return(nfc_uid, photo_path)

    if not result:
        return False

    if result.get("action") == "return":
        score = result.get("score", 0)
        wallet = result.get("wallet", "?")
        print(f"\n{'─' * 40}")
        print(f"[RETURN] Tray {nfc_uid} returned by {wallet}")
        print()
        print(f"  ✅ +{score} pts")
        print()
        print("[RETURN] Remove the tray...")
        wait_for_removal()
        print(f"{'─' * 40}\n")
        return True

    # "ignored" = tag not associated → stay silent, no log spam
    return False


# ──────────────────────────────────────────
# Main loops
# ──────────────────────────────────────────

def run_camera_loop():
    """
    Camera mode: continuous QR scanning + NFC polling.
    - Camera captures frames looking for QR
    - Between frames, quick NFC check for tray returns
    - NFC only triggers return flow if tag is actually associated
    """
    init_camera()
    print("[LOOP] Camera mode — scanning for QR codes and NFC tags...\n")

    while True:
        # Quick NFC check (non-blocking, 100ms)
        uid = read_uid(timeout=0.1)
        if uid:
            try_return(uid)
            # Don't "continue" here: even if ignored,
            # keep scanning QR on the same iteration

        # Scan camera for QR (one frame, fast)
        qr_data = read_qr_camera()
        if qr_data and "s" in qr_data:
            handle_pickup_flow(qr_data)
            continue

        time.sleep(0.05)


def run_manual_loop():
    """
    Manual mode: interactive QR input.
    Checks NFC between prompts for tray returns.
    """
    while True:
        # Check NFC (returns silently if tag is not associated)
        uid = read_uid(timeout=NFC_TIMEOUT)
        if uid:
            returned = try_return(uid)
            if returned:
                continue

        print("\n[IDLE] Waiting for QR input (or NFC tray return)...")
        qr_data = read_qr_manual()

        if qr_data and "s" in qr_data:
            handle_pickup_flow(qr_data)
        elif qr_data is None:
            print("[EXIT] Shutting down...")
            break
        else:
            print("[IDLE] Invalid QR, retrying...")


def run_file_loop():
    """
    File mode: reads QR from image file periodically.
    Also polls NFC for tray returns.
    """
    while True:
        uid = read_uid(timeout=NFC_TIMEOUT)
        if uid:
            returned = try_return(uid)
            if returned:
                continue

        qr_data = read_qr_file(QR_IMAGE_PATH)
        if qr_data and "s" in qr_data:
            handle_pickup_flow(qr_data)

        print(f"[FILE] Waiting 5s before re-reading {QR_IMAGE_PATH}...")
        time.sleep(5)


def main():
    banner()

    print("[INIT] Initializing NFC reader...")
    init_nfc()

    if qr_mode == "camera":
        run_camera_loop()
    elif qr_mode == "file":
        run_file_loop()
    else:
        run_manual_loop()


if __name__ == "__main__":
    main()
