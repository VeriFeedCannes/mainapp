"""
Traycer Station — Backend HTTP Client

All calls to the Next.js backend go through here.
Station authenticates with X-Station-Secret header.
"""

import base64
import requests
from config import BACKEND_URL, STATION_ID, STATION_SECRET


HEADERS = {
    "Content-Type": "application/json",
    "X-Station-Secret": STATION_SECRET,
}

TIMEOUT = 10


def validate_session(session_id):
    """
    POST /api/session/validate
    Returns session data dict if valid, None otherwise.
    """
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/session/validate",
            json={"session_id": session_id, "station_id": STATION_ID},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        if data.get("valid"):
            print(f"[API] Session valid — wallet={data.get('wallet')} action={data.get('action')}")
            return data
        else:
            print(f"[API] Session invalid — {data.get('error', 'unknown')}")
            return None
    except Exception as e:
        print(f"[API] validate_session error: {e}")
        return None


def complete_session(session_id, nfc_uid):
    """
    POST /api/session/complete
    Completes a pickup/enroll/claim session after NFC scan.
    """
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/session/complete",
            json={"session_id": session_id, "nfc_uid": nfc_uid},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        if data.get("success"):
            print(f"[API] Session completed — action={data.get('action')} wallet={data.get('wallet')}")
            return data
        else:
            print(f"[API] Complete failed — {data.get('error', 'unknown')}")
            return None
    except Exception as e:
        print(f"[API] complete_session error: {e}")
        return None


def deposit_return(nfc_uid, photo_path=None):
    """
    POST /api/deposit
    Handles tray return: send NFC UID + optional photo for AI analysis.
    """
    photo_b64 = None
    if photo_path:
        try:
            with open(photo_path, "rb") as f:
                photo_b64 = base64.b64encode(f.read()).decode("utf-8")
            print(f"[API] Photo encoded ({len(photo_b64)} chars)")
        except Exception as e:
            print(f"[API] Photo encode error: {e}")

    try:
        res = requests.post(
            f"{BACKEND_URL}/api/deposit",
            json={"nfc_uid": nfc_uid, "photo_base64": photo_b64},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        action = data.get("action")
        if action == "return":
            print(f"[API] Return OK — +{data.get('score')} pts for {data.get('wallet')}")
        elif action == "ignored":
            print(f"[API] Tag not associated — ignored")
        else:
            print(f"[API] Deposit response: {data}")
        return data
    except Exception as e:
        print(f"[API] deposit_return error: {e}")
        return None
