"""
Arx HaLo NFC Chip — NDEF reader for PN532

Reads the NDEF URL from an Arx HaLo chip via ISO 14443-4 APDUs,
extracts the public key (pk1), and derives the Ethereum address.

Requirements:
  pip install pycryptodome

The PN532 must have already activated the target via read_passive_target()
before calling read_halo_address().
"""

from urllib.parse import urlparse, parse_qs

try:
    from Crypto.Hash import keccak
except ImportError:
    keccak = None
    print("[HALO] WARNING: pycryptodome not installed — address derivation disabled")
    print("[HALO]   Install with: pip install pycryptodome")


# ── NDEF Type 4 Tag APDUs ──

SELECT_NDEF_APP = bytes([
    0x00, 0xA4, 0x04, 0x00,
    0x07,
    0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01,
    0x00,
])

SELECT_CC_FILE = bytes([0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x03])

READ_CC = bytes([0x00, 0xB0, 0x00, 0x00, 0x0F])

SELECT_NDEF_FILE = bytes([0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x04])

READ_NDEF_LEN = bytes([0x00, 0xB0, 0x00, 0x00, 0x02])

# URI record identifier codes (NFC Forum)
URI_PREFIXES = {
    0x00: "",
    0x01: "http://www.",
    0x02: "https://www.",
    0x03: "http://",
    0x04: "https://",
}


_PN532_COMMAND_INDATAEXCHANGE = 0x40


def _apdu(pn532, cmd: bytes, resp_len: int = 255, timeout: int = 1) -> bytes | None:
    """
    Send an ISO 14443-4 APDU via PN532 InDataExchange.
    Uses call_function directly since older adafruit_pn532 versions
    don't expose in_data_exchange().
    """
    try:
        # InDataExchange: [target_number=1, ...apdu]
        params = bytearray([0x01]) + bytearray(cmd)
        resp = pn532.call_function(
            _PN532_COMMAND_INDATAEXCHANGE,
            params=params,
            response_length=resp_len + 1,  # +1 for error byte
            timeout=timeout,
        )
        if resp is None:
            return None
        # First byte is error code: 0x00 = success
        if resp[0] != 0x00:
            print(f"[HALO] InDataExchange error code: 0x{resp[0]:02X}")
            return None
        return bytes(resp[1:])
    except Exception as e:
        print(f"[HALO] APDU error: {e}")
        return None


def _parse_ndef_url(ndef_data: bytes) -> str | None:
    """
    Parse an NDEF message and extract the URL from the first URI record.
    Handles both short (1-byte) and long (4-byte) payload length formats.
    """
    if len(ndef_data) < 4:
        return None

    idx = 0
    while idx < len(ndef_data):
        if idx + 3 > len(ndef_data):
            break

        header = ndef_data[idx]
        tnf = header & 0x07
        is_short = (header >> 4) & 0x01
        idx += 1

        type_len = ndef_data[idx]
        idx += 1

        if is_short:
            payload_len = ndef_data[idx]
            idx += 1
        else:
            if idx + 4 > len(ndef_data):
                break
            payload_len = int.from_bytes(ndef_data[idx:idx+4], "big")
            idx += 4

        rec_type = ndef_data[idx:idx+type_len]
        idx += type_len

        payload = ndef_data[idx:idx+payload_len]
        idx += payload_len

        # URI Record: TNF=1 (Well-known), Type="U"
        if tnf == 0x01 and rec_type == b"U" and len(payload) >= 2:
            prefix_code = payload[0]
            prefix = URI_PREFIXES.get(prefix_code, "")
            url = prefix + payload[1:].decode("utf-8", errors="replace")
            return url

    return None


def _pubkey_to_address(pk_hex: str) -> str | None:
    """Derive Ethereum address from uncompressed public key hex."""
    if keccak is None:
        print("[HALO] keccak not available — install pycryptodome")
        return None

    print(f"[HALO] pk1 hex ({len(pk_hex)} chars): {pk_hex[:40]}...")

    try:
        pk_bytes = bytes.fromhex(pk_hex)
    except ValueError as e:
        print(f"[HALO] Invalid hex in pk1: {e}")
        return None

    print(f"[HALO] pk1 bytes length: {len(pk_bytes)}")

    if pk_bytes[0] == 0x04 and len(pk_bytes) == 65:
        pk_bytes = pk_bytes[1:]  # strip 04 prefix
    elif len(pk_bytes) != 64:
        print(f"[HALO] Unexpected public key length: {len(pk_bytes)} (expected 65 with 04 prefix)")
        return None

    h = keccak.new(data=pk_bytes, digest_bits=256).digest()
    return "0x" + h[-20:].hex()


def read_halo_address(pn532) -> str | None:
    """
    Read the Ethereum address from an Arx HaLo chip already activated
    on the PN532 reader.

    Returns the Ethereum address (0x...) or None on failure.
    The target must have been activated via read_passive_target() first.
    """
    # 1. SELECT NDEF Application
    resp = _apdu(pn532, SELECT_NDEF_APP)
    if resp is None:
        print("[HALO] Failed: SELECT NDEF Application")
        return None
    # Check SW1 SW2 = 90 00
    if len(resp) < 2 or resp[-2:] != b'\x90\x00':
        print(f"[HALO] SELECT NDEF App rejected: {resp.hex() if resp else 'empty'}")
        return None

    # 2. SELECT CC file
    resp = _apdu(pn532, SELECT_CC_FILE)
    if resp is None or (len(resp) >= 2 and resp[-2:] != b'\x90\x00'):
        print("[HALO] Failed: SELECT CC file")
        return None

    # 3. READ CC to find NDEF file ID
    resp = _apdu(pn532, READ_CC, resp_len=20)
    if resp is None or len(resp) < 4:
        print(f"[HALO] Failed: READ CC file (got {len(resp) if resp else 0} bytes)")
        return None
    print(f"[HALO] CC data ({len(resp)} bytes): {resp.hex()}")
    # CC TLV: bytes 7-8 are the NDEF file ID in a standard CC
    # Try to extract, fallback to E104
    ndef_file_id = b'\xE1\x04'
    if len(resp) >= 11 and resp[-2:] == b'\x90\x00':
        cc_body = resp[:-2]  # strip SW
        # In NFC Forum Type 4: CC file = CCLEN(2) + version(1) + MLe(2) + MLc(2) + TLV...
        # TLV starts at byte 7: T=04, L=06, V=[fileID(2), maxNDEFsize(2), readAccess(1), writeAccess(1)]
        if len(cc_body) >= 11 and cc_body[7] == 0x04:
            ndef_file_id = bytes(cc_body[9:11])
    print(f"[HALO] NDEF file ID: {ndef_file_id.hex()}")

    # 4. SELECT NDEF file
    select_ndef = bytes([0x00, 0xA4, 0x00, 0x0C, 0x02]) + ndef_file_id
    resp = _apdu(pn532, select_ndef)
    if resp is None or (len(resp) >= 2 and resp[-2:] != b'\x90\x00'):
        print(f"[HALO] Failed: SELECT NDEF file ({resp.hex() if resp else 'None'})")
        return None

    # 5. READ NDEF message length (first 2 bytes of the file)
    resp = _apdu(pn532, READ_NDEF_LEN, resp_len=10)
    if resp is None or len(resp) < 4:
        print(f"[HALO] Failed: READ NDEF length (got {resp.hex() if resp else 'None'})")
        return None
    print(f"[HALO] NDEF len raw: {resp.hex()}")
    # Strip SW1 SW2 if present
    if resp[-2:] == b'\x90\x00':
        len_bytes = resp[:-2]
    else:
        len_bytes = resp[:2]
    ndef_len = int.from_bytes(len_bytes[:2], "big")
    print(f"[HALO] NDEF message length: {ndef_len} bytes")
    if ndef_len == 0 or ndef_len > 1024:
        print(f"[HALO] Unexpected NDEF length: {ndef_len}")
        return None

    # 6. READ NDEF data in small chunks (PN532 I2C buffer is ~64 bytes)
    MAX_CHUNK = 50
    ndef_data = bytearray()
    offset = 2  # skip the 2-byte length prefix
    remaining = ndef_len
    while remaining > 0:
        chunk_size = min(remaining, MAX_CHUNK)
        read_cmd = bytes([0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, chunk_size])
        resp = _apdu(pn532, read_cmd, resp_len=chunk_size + 4)
        if resp is None or len(resp) < 3:
            print(f"[HALO] Failed: READ NDEF at offset {offset} (got {resp.hex() if resp else 'None'})")
            return None
        # Strip SW1 SW2 (last 2 bytes)
        if resp[-2:] == b'\x90\x00':
            chunk = resp[:-2]
        else:
            chunk = resp
        if len(chunk) == 0:
            print(f"[HALO] Empty chunk at offset {offset}")
            break
        ndef_data.extend(chunk)
        offset += len(chunk)
        remaining -= len(chunk)
        print(f"[HALO] Read {len(chunk)} bytes at offset {offset - len(chunk)}, {remaining} remaining")

    # 7. Parse NDEF to extract URL
    url = _parse_ndef_url(bytes(ndef_data))
    if not url:
        print("[HALO] Could not parse NDEF URL")
        print(f"[HALO] Raw NDEF ({len(ndef_data)} bytes): {ndef_data[:80].hex()}...")
        return None

    print(f"[HALO] NDEF URL: {url[:100]}...")

    # 8. Extract pk1 from URL query string
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    pk1_list = params.get("pk1")
    if not pk1_list:
        print("[HALO] No pk1 parameter in NDEF URL")
        return None
    pk1_hex = pk1_list[0]

    # 9. Derive Ethereum address
    address = _pubkey_to_address(pk1_hex)
    if not address:
        print("[HALO] Failed to derive address from pk1")
        return None

    print(f"[HALO] Chip address: {address}")
    return address


def _parse_der_signature(der_hex: str) -> dict | None:
    """
    Parse a DER-encoded ECDSA signature into r and s hex strings.
    DER format: 30 <total_len> 02 <r_len> <r> 02 <s_len> <s>
    """
    try:
        der = bytes.fromhex(der_hex)
    except ValueError:
        return None

    if len(der) < 8 or der[0] != 0x30:
        return None

    idx = 2  # skip 30 <len>

    if der[idx] != 0x02:
        return None
    idx += 1
    r_len = der[idx]
    idx += 1
    r_bytes = der[idx:idx + r_len]
    idx += r_len

    if idx >= len(der) or der[idx] != 0x02:
        return None
    idx += 1
    s_len = der[idx]
    idx += 1
    s_bytes = der[idx:idx + s_len]

    # Strip leading zero byte (DER uses signed integers)
    if r_bytes[0] == 0x00 and len(r_bytes) > 1:
        r_bytes = r_bytes[1:]
    if s_bytes[0] == 0x00 and len(s_bytes) > 1:
        s_bytes = s_bytes[1:]

    return {
        "r": r_bytes.hex().zfill(64),
        "s": s_bytes.hex().zfill(64),
    }


# HaLo proprietary command codes (from libhalo source)
_HALO_CMD_SIGN = 0x01       # returns DER signature only (~72 bytes)
_HALO_CMD_FETCH_SIGN = 0x06  # returns DER signature + pubkey (~137 bytes)

# Timeout for sign operations — ECDSA computation takes ~1s on the secure element
_SIGN_TIMEOUT = 5


def halo_sign_digest(pn532, digest_hex: str) -> dict | None:
    """
    Sign a 32-byte digest using the HaLo chip's key slot 1.

    Uses the proprietary B0 51 APDU (same as libhalo PC/SC driver).
    The chip must already be activated via read_passive_target().
    DO NOT call release_target() before this — the tag must stay active.

    Returns {"r": hex, "s": hex} or None on failure.
    """
    try:
        digest_bytes = bytes.fromhex(digest_hex)
    except ValueError:
        print("[HALO-SIGN] Invalid digest hex")
        return None

    if len(digest_bytes) != 32:
        print(f"[HALO-SIGN] Digest must be 32 bytes, got {len(digest_bytes)}")
        return None

    # Use SHARED_CMD_SIGN (0x01) — returns only DER signature, no pubkey.
    # Smaller response avoids I2C buffer issues.
    command = bytearray([_HALO_CMD_SIGN, 0x01]) + bytearray(digest_bytes)

    # Wrap in proprietary APDU: B0 51 00 00 <Lc> <command> 00
    apdu = bytearray([0xB0, 0x51, 0x00, 0x00, len(command)]) + command + bytearray([0x00])

    print(f"[HALO-SIGN] Sending sign APDU ({len(apdu)} bytes), digest={digest_hex[:16]}...")
    print(f"[HALO-SIGN] Waiting up to {_SIGN_TIMEOUT}s for chip to compute signature...")

    resp = _apdu(pn532, bytes(apdu), resp_len=80, timeout=_SIGN_TIMEOUT)
    if resp is None or len(resp) < 8:
        print(f"[HALO-SIGN] Sign APDU failed (got {len(resp) if resp else 0} bytes)")
        return None

    print(f"[HALO-SIGN] Got {len(resp)} bytes back: {resp[:4].hex()}...")

    # Check for HaLo error response (E1 xx)
    if len(resp) >= 2 and resp[0] == 0xE1:
        print(f"[HALO-SIGN] Chip error: 0x{resp[1]:02X}")
        return None

    # Parse response: DER signature only (no pubkey with CMD_SIGN)
    if resp[0] != 0x30:
        print(f"[HALO-SIGN] Unexpected response start: 0x{resp[0]:02X} (full: {resp.hex()})")
        return None

    sig_len = resp[1] + 2
    der_hex = resp[:sig_len].hex()
    print(f"[HALO-SIGN] DER signature ({sig_len} bytes): {der_hex[:40]}...")

    parsed = _parse_der_signature(der_hex)
    if not parsed:
        print("[HALO-SIGN] Failed to parse DER signature")
        return None

    result = {
        "r": parsed["r"],
        "s": parsed["s"],
        "der": der_hex,
    }

    print(f"[HALO-SIGN] Signature OK — r={parsed['r'][:16]}... s={parsed['s'][:16]}...")
    return result


def is_wristband_uid(uid_str: str) -> bool:
    """
    Arx HaLo wristbands have a 4-byte UID (XX:XX:XX:XX),
    while regular NTAG/MIFARE tags have 7-byte UIDs (XX:XX:XX:XX:XX:XX:XX).
    """
    parts = uid_str.split(":")
    return len(parts) == 4
