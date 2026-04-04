export type SessionAction = "pickup" | "enroll" | "claim";
export type SessionStatus = "active" | "scanned" | "completed" | "expired";

export interface Session {
  session_id: string;
  wallet: string;
  station_id: string;
  action: SessionAction;
  status: SessionStatus;
  nfc_uid: string | null;
  created_at: number;
  expires_at: number;
}

export interface PlateAssociation {
  nfc_uid: string;
  wallet: string;
  associated_at: number;
}

export type ReturnSignalStatus = "waiting" | "capture" | "done";

export interface ReturnSignal {
  nfc_uid: string;
  wallet: string;
  status: ReturnSignalStatus;
  created_at: number;
}

// Survive Next.js hot-reload in dev mode
const g = globalThis as unknown as {
  __traycer_sessions?: Map<string, Session>;
  __traycer_plates?: Map<string, PlateAssociation>;
  __traycer_signals?: Map<string, ReturnSignal>;
};
const sessions = (g.__traycer_sessions ??= new Map<string, Session>());
const plateAssociations = (g.__traycer_plates ??= new Map<string, PlateAssociation>());
const returnSignals = (g.__traycer_signals ??= new Map<string, ReturnSignal>());

const STATION_SECRET = process.env.STATION_SECRET || "dev-station-secret";
const SESSION_TTL = 120_000; // 2 minutes

function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "trc_";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function cleanExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expires_at && session.status !== "completed") {
      session.status = "expired";
      sessions.delete(id);
    }
  }
}

export function verifyStationSecret(secret: string | null): boolean {
  return secret === STATION_SECRET;
}

export function createSession(
  wallet: string,
  action: SessionAction,
  station_id: string = "cannes-1",
): Session {
  cleanExpired();

  // 1 active session max per wallet per action type
  for (const s of sessions.values()) {
    if (
      s.wallet === wallet &&
      s.action === action &&
      s.status === "active"
    ) {
      s.status = "expired";
    }
  }

  const session: Session = {
    session_id: generateSessionId(),
    wallet,
    station_id,
    action,
    status: "active",
    nfc_uid: null,
    created_at: Date.now(),
    expires_at: Date.now() + SESSION_TTL,
  };

  sessions.set(session.session_id, session);
  return session;
}

export function getSession(session_id: string): Session | null {
  cleanExpired();
  return sessions.get(session_id) ?? null;
}

export function validateSession(
  session_id: string,
  station_id: string,
): { valid: boolean; session?: Session; error?: string } {
  cleanExpired();
  const session = sessions.get(session_id);

  if (!session) return { valid: false, error: "Session not found" };
  if (session.status !== "active")
    return { valid: false, error: `Session status: ${session.status}` };
  if (Date.now() > session.expires_at)
    return { valid: false, error: "Session expired" };
  if (session.station_id !== station_id)
    return { valid: false, error: "Wrong station" };

  session.status = "scanned";
  return { valid: true, session };
}

export function completeSession(
  session_id: string,
  nfc_uid?: string,
): { success: boolean; session?: Session; error?: string } {
  const session = sessions.get(session_id);

  if (!session) return { success: false, error: "Session not found" };
  if (session.status !== "scanned")
    return { success: false, error: `Session status: ${session.status}` };

  if (session.action === "pickup" && nfc_uid) {
    session.nfc_uid = nfc_uid;
    plateAssociations.set(nfc_uid, {
      nfc_uid,
      wallet: session.wallet,
      associated_at: Date.now(),
    });
    // Prevent stale return signal if the tag is still on the reader after pickup
    returnSignals.delete(nfc_uid);
  }

  session.status = "completed";
  return { success: true, session };
}

export function getSessionByWallet(
  wallet: string,
): Session | null {
  cleanExpired();
  for (const s of sessions.values()) {
    if (s.wallet === wallet && (s.status === "active" || s.status === "scanned")) {
      return s;
    }
  }
  return null;
}

export function getPlateAssociation(
  nfc_uid: string,
): PlateAssociation | null {
  return plateAssociations.get(nfc_uid) ?? null;
}

export function getPlateByWallet(
  wallet: string,
): PlateAssociation | null {
  for (const assoc of plateAssociations.values()) {
    if (assoc.wallet === wallet) return assoc;
  }
  return null;
}

export function removePlateAssociation(nfc_uid: string): PlateAssociation | null {
  const assoc = plateAssociations.get(nfc_uid);
  if (assoc) {
    plateAssociations.delete(nfc_uid);
    return assoc;
  }
  return null;
}

// ── Return signals ──

export function createReturnSignal(nfc_uid: string, wallet: string): ReturnSignal {
  const signal: ReturnSignal = { nfc_uid, wallet, status: "waiting", created_at: Date.now() };
  returnSignals.set(nfc_uid, signal);
  return signal;
}

export function getReturnSignalByWallet(wallet: string): ReturnSignal | null {
  for (const sig of returnSignals.values()) {
    if (sig.wallet === wallet && sig.status !== "done") return sig;
  }
  return null;
}

export function getReturnSignalByUid(nfc_uid: string): ReturnSignal | null {
  return returnSignals.get(nfc_uid) ?? null;
}

export function setReturnSignalCapture(wallet: string): boolean {
  for (const sig of returnSignals.values()) {
    if (sig.wallet === wallet && sig.status === "waiting") {
      sig.status = "capture";
      return true;
    }
  }
  return false;
}

export function clearReturnSignal(nfc_uid: string): void {
  returnSignals.delete(nfc_uid);
}

export function clearAllForWallet(wallet: string): void {
  for (const [id, s] of sessions) {
    if (s.wallet === wallet) sessions.delete(id);
  }
  for (const [uid, assoc] of plateAssociations) {
    if (assoc.wallet === wallet) plateAssociations.delete(uid);
  }
  for (const [uid, sig] of returnSignals) {
    if (sig.wallet === wallet) returnSignals.delete(uid);
  }
}

export function buildQrPayload(session: Session) {
  return {
    s: session.session_id,
    t: session.station_id,
    a: session.action,
    e: Math.floor(session.expires_at / 1000),
  };
}
