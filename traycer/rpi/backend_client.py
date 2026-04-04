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


def check_plate(nfc_uid):
    """GET /api/plate/check — check if tag is associated (read-only, no side effects)."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/api/plate/check",
            params={"nfc_uid": nfc_uid},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        if data.get("associated"):
            print(f"[API] Plate check — associated to {data.get('wallet')}")
            return data
        print("[API] Plate check — not associated")
        return None
    except Exception as e:
        print(f"[API] check_plate error: {e}")
        return None


def signal_return_ready(nfc_uid):
    """POST /api/return/signal — tell backend the NFC tag is on the reader."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/return/signal",
            json={"nfc_uid": nfc_uid, "action": "ready"},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        if data.get("ok"):
            print(f"[API] Return signal: ready — wallet={data.get('signal', {}).get('wallet')}")
            return True
        print(f"[API] Return signal failed: {data.get('error')}")
        return False
    except Exception as e:
        print(f"[API] signal_return_ready error: {e}")
        return False


def poll_capture_signal(nfc_uid):
    """GET /api/return/signal — check if web user triggered capture."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/api/return/signal",
            params={"nfc_uid": nfc_uid},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        signal = data.get("signal")
        if signal and signal.get("status") == "capture":
            return True
        return False
    except Exception as e:
        print(f"[API] poll_capture_signal error: {e}")
        return False


def signal_return_done(nfc_uid):
    """POST /api/return/signal — clear the return signal after completion."""
    try:
        requests.post(
            f"{BACKEND_URL}/api/return/signal",
            json={"nfc_uid": nfc_uid, "action": "done"},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
    except Exception:
        pass


def arx_connect(address):
    """POST /api/auth/arx-connect — send wristband Ethereum address to backend."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/auth/arx-connect",
            json={"address": address},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        if data.get("ok"):
            print(f"[API] Arx wristband connected: {address}")
            return True
        print(f"[API] Arx connect failed: {data.get('error')}")
        return False
    except Exception as e:
        print(f"[API] arx_connect error: {e}")
        return False


def arx_session_claim(address):
    """POST /api/arx/session-claim — check if a pickup session exists for this wallet."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/arx/session-claim",
            json={"address": address},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        session = data.get("session")
        if session:
            print(f"[API] Session claimed: {session.get('session_id')} action={session.get('action')}")
            return session
        return None
    except Exception as e:
        print(f"[API] arx_session_claim error: {e}")
        return None


def check_pending_sign(address):
    """GET /api/arx/pending-sign — check if backend has a tx digest to sign for this address."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/api/arx/pending-sign",
            params={"address": address},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        data = res.json()
        if data.get("pending"):
            print(f"[API] Pending sign request: {data.get('requestId')} digest={data.get('digestHex', '')[:16]}...")
            return data
        return None
    except Exception as e:
        print(f"[API] check_pending_sign error: {e}")
        return None


def submit_sign_result(request_id, signature_data):
    """POST /api/arx/sign-result — send chip signature to backend for tx assembly + broadcast."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/arx/sign-result",
            json={"requestId": request_id, **signature_data},
            headers=HEADERS,
            timeout=15,
        )
        data = res.json()
        if data.get("ok"):
            print(f"[API] Sign result accepted — txHash={data.get('txHash', '?')[:20]}...")
            return data
        print(f"[API] Sign result failed: {data.get('error')}")
        return None
    except Exception as e:
        print(f"[API] submit_sign_result error: {e}")
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
