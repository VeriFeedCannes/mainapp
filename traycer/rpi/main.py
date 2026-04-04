"""
Traycer Station — Main Loop

State machine:
  IDLE → scan QR (camera/manual/file) + poll NFC

  QR found → validate → wait NFC → complete → IDLE
  NFC in idle → check if associated (no photo) →
    if return: take photo, send for analysis
    if not associated: silent ignore

Usage:
  python main.py              # uses QR_MODE from config.py
  python main.py --qr manual  # paste QR in terminal
  python main.py --qr camera  # live camera feed
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
from qr_reader import read_qr_manual, read_qr_file, read_qr_camera, init_camera, capture_photo, pause_camera, resume_camera, warmup_still, snap_still
from backend_client import (
    validate_session,
    complete_session,
    check_plate,
    deposit_return,
    signal_return_ready,
    poll_capture_signal,
    signal_return_done,
)


# ──────────────────────────────────────────
# CLI args
# ──────────────────────────────────────────
qr_mode = QR_MODE
for i, arg in enumerate(sys.argv):
    if arg == "--qr" and i + 1 < len(sys.argv):
        qr_mode = sys.argv[i + 1]

# Cooldown: don't re-check the same unassociated tag
_last_ignored_uid = None
_last_ignored_time = 0
IGNORED_COOLDOWN = 30  # 30s for tags that aren't associated


def banner():
    print()
    print("=" * 50)
    print("  TRAYCER STATION")
    print(f"  Station : {STATION_ID}")
    print(f"  Backend : {BACKEND_URL}")
    print(f"  QR mode : {qr_mode}")
    print("=" * 50)
    print()


def is_ignored_cooldown(uid):
    """Check if this UID was recently checked and found unassociated."""
    global _last_ignored_uid, _last_ignored_time
    now = time.time()
    if uid == _last_ignored_uid and (now - _last_ignored_time) < IGNORED_COOLDOWN:
        return True
    return False


def mark_ignored(uid):
    global _last_ignored_uid, _last_ignored_time
    _last_ignored_uid = uid
    _last_ignored_time = time.time()


def clear_ignored():
    global _last_ignored_uid, _last_ignored_time
    _last_ignored_uid = None
    _last_ignored_time = 0


# ──────────────────────────────────────────
# Flow handlers
# ──────────────────────────────────────────

def handle_pickup_flow(qr_data):
    """QR scanned → validate → wait NFC (binding) → complete."""
    session_id = qr_data["s"]
    action = qr_data.get("a", "pickup")

    print(f"\n{'─' * 40}")
    print(f"[FLOW] QR scanned — session: {session_id} / action: {action}")

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

    pause_camera()

    uid = wait_for_tag(timeout_seconds=SESSION_TIMEOUT)
    if not uid:
        print("[FLOW] Timeout — no tray detected. Back to idle.")
        resume_camera()
        return

    result = complete_session(session_id, uid)
    if result:
        print(f"[FLOW] ✅ Tray {uid} linked to {wallet}")
        clear_ignored()
    else:
        print(f"[FLOW] ❌ Failed to complete session")

    print("[FLOW] Remove the tray from the reader...")
    wait_for_removal()
    resume_camera()
    print(f"{'─' * 40}\n")


CAPTURE_POLL_TIMEOUT = 120  # seconds


def try_return(nfc_uid):
    """
    NFC in idle mode. Web-signaled approach:
    1. Lightweight check — is this tag associated?
    2. Signal backend "ready" → web shows confetti
    3. Poll for "capture" signal from web user (timeout 120s)
    4. Take ONE photo, call /api/deposit, signal "done"
    """
    if is_ignored_cooldown(nfc_uid):
        return False

    print(f"[NFC] Tag {nfc_uid} — checking association...")
    result = check_plate(nfc_uid)

    if not result:
        mark_ignored(nfc_uid)
        return False

    wallet = result.get("wallet", "?")
    print(f"\n{'─' * 40}")
    print(f"[RETURN] Tray {nfc_uid} belongs to {wallet}")

    pause_camera()

    if not signal_return_ready(nfc_uid):
        print("[RETURN] Failed to signal ready — falling back to Enter")
        input("[RETURN] Press ENTER to capture...")
    else:
        # Start camera in still mode NOW so it warms up (AE/AWB/AF) while waiting
        if qr_mode == "camera":
            warmup_still()

        print("[RETURN] Waiting for web user to press 'Done'...")
        start = time.time()
        while time.time() - start < CAPTURE_POLL_TIMEOUT:
            if poll_capture_signal(nfc_uid):
                print("[RETURN] Capture signal received!")
                break
            time.sleep(1)
        else:
            print("[RETURN] Timeout — no capture signal. Skipping photo.")
            signal_return_done(nfc_uid)
            deposit = deposit_return(nfc_uid, photo_path=None)
            if deposit and deposit.get("action") == "return":
                print(f"[RETURN] ✅ +{deposit.get('score', 0)} pts (no photo)")
            print("[RETURN] Remove the tray...")
            wait_for_removal()
            resume_camera()
            clear_ignored()
            print(f"{'─' * 40}\n")
            return True

    photo_path = None
    if qr_mode == "camera":
        ts = int(time.time())
        photo_path = snap_still(f"return_{nfc_uid.replace(':', '')}_{ts}.jpg")
        if photo_path:
            print(f"[RETURN] Photo captured: {photo_path}")

    deposit = deposit_return(nfc_uid, photo_path=photo_path)
    signal_return_done(nfc_uid)

    if deposit and deposit.get("action") == "return":
        score = deposit.get("score", 0)
        print(f"[RETURN] ✅ +{score} pts for {wallet}")
    else:
        print("[RETURN] ❌ Deposit failed")

    print("[RETURN] Remove the tray...")
    wait_for_removal()
    resume_camera()
    clear_ignored()
    print(f"{'─' * 40}\n")
    return True


# ──────────────────────────────────────────
# Main loops
# ──────────────────────────────────────────

def run_camera_loop():
    """
    Camera mode: scan QR frames + quick NFC check.
    NFC check is lightweight (no photo, no camera switch).
    """
    init_camera()
    print("[LOOP] Camera mode — scanning for QR codes and NFC tags...\n")

    frame_count = 0
    last_status = time.time()

    while True:
        # Quick NFC check (100ms, no camera switch)
        uid = read_uid(timeout=0.1)
        if uid:
            try_return(uid)

        # Scan one frame for QR
        qr_data = read_qr_camera()
        frame_count += 1

        if qr_data and "s" in qr_data:
            handle_pickup_flow(qr_data)
            frame_count = 0
            continue

        # Status log every 10 seconds
        now = time.time()
        if now - last_status > 10:
            print(f"  [scanning... {frame_count} frames, no QR yet]")
            last_status = now

        time.sleep(0.05)


def run_manual_loop():
    """Manual mode: paste QR + NFC check between prompts."""
    while True:
        uid = read_uid(timeout=NFC_TIMEOUT)
        if uid:
            if try_return(uid):
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
    """File mode: read QR from image + NFC check."""
    while True:
        uid = read_uid(timeout=NFC_TIMEOUT)
        if uid:
            if try_return(uid):
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
