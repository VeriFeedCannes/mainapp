"""
Traycer Station — NFC Reader (PN532 via I2C)

Based on the working script with adafruit_pn532.
Returns UID as colon-separated hex string (e.g. "04:A2:F3:8B:12:34:56").
"""

import time
import board
import busio
from adafruit_pn532.i2c import PN532_I2C


_pn532 = None


def init_nfc():
    """Initialize PN532 over I2C. Returns the pn532 instance."""
    global _pn532
    print("[NFC] Initializing I2C...")
    i2c = busio.I2C(board.SCL, board.SDA)
    _pn532 = PN532_I2C(i2c, debug=False)
    _pn532.SAM_configuration()

    ic, ver, rev, support = _pn532.firmware_version
    print(f"[NFC] PN532 v{ver}.{rev} ready (IC: 0x{ic:02X})")
    return _pn532


def get_pn532():
    """Return the raw PN532 instance (for APDU commands)."""
    return _pn532


def release_target():
    """Send InRelease to free the PN532 target slot after APDU exchange."""
    if _pn532 is None:
        return
    try:
        _pn532.call_function(0x52, params=bytearray([0x00]))
    except Exception:
        pass


def read_uid(timeout=0.5):
    """
    Try to read a passive NFC tag.
    Returns UID as "XX:XX:XX:XX..." string, or None.
    """
    if _pn532 is None:
        raise RuntimeError("NFC not initialized — call init_nfc() first")

    try:
        uid = _pn532.read_passive_target(timeout=timeout)
    except RuntimeError:
        # PN532 can be in a bad state after APDU exchange; reset it
        try:
            _pn532.SAM_configuration()
        except Exception:
            pass
        return None
    if uid is not None:
        return ":".join(f"{b:02X}" for b in uid)
    return None


def wait_for_tag(timeout_seconds=120, poll_interval=0.5):
    """
    Block until a tag is detected or timeout.
    Returns UID string or None on timeout.
    """
    print(f"[NFC] Waiting for tag (timeout {timeout_seconds}s)...")
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        uid = read_uid(timeout=poll_interval)
        if uid:
            print(f"[NFC] Tag detected: {uid}")
            return uid
        time.sleep(0.05)

    print("[NFC] Timeout — no tag detected")
    return None


def wait_for_removal(poll_interval=0.3):
    """Block until the current tag is removed from the reader."""
    while True:
        uid = read_uid(timeout=poll_interval)
        if uid is None:
            return
        time.sleep(0.1)
