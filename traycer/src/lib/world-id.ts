/**
 * World ID 4.0 proof verification via developer.world.org API.
 *
 * v4 flow:
 *   1. Frontend generates proof via IDKitRequestWidget (with RP signature)
 *   2. Frontend sends the full IDKit result to our backend
 *   3. Backend forwards it as-is to POST /v4/verify/{rp_id}
 *   4. Backend extracts nullifier from responses[0].nullifier
 *
 * Import strategy:
 *   - signRequest from @worldcoin/idkit-core/signing (see /api/idkit/rp-signature)
 *   - IDKitRequestWidget from @worldcoin/idkit (React, frontend)
 *   - This file is server-only (no React deps)
 */

export interface IdKitResponse {
  protocol_version: string;
  nonce: string;
  action?: string;
  environment?: string;
  responses: Array<{
    identifier: string;
    signal_hash?: string;
    proof: string | string[];
    merkle_root?: string;
    nullifier: string;
    nullifier_hash?: string;
    issuer_schema_id?: number;
    expires_at_min?: number;
  }>;
}

export interface VerifyResult {
  success: boolean;
  nullifier?: string;
  [key: string]: unknown;
}

const VERIFY_V4_BASE = "https://developer.world.org/api/v4/verify";

export async function verifyWorldIdV4(
  idkitResult: IdKitResponse,
  rpId: string,
): Promise<VerifyResult> {
  const url = `${VERIFY_V4_BASE}/${rpId}`;
  console.log("[WORLD-ID-v4] POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(idkitResult),
  });

  const data = await res.json();
  console.log("[WORLD-ID-v4] Response:", res.status, JSON.stringify(data));

  if (!res.ok) return { success: false, ...data };

  const nullifier = idkitResult.responses?.[0]?.nullifier
    ?? idkitResult.responses?.[0]?.nullifier_hash;

  return { success: true, nullifier, ...data };
}

// ── Legacy v2 helper kept for routes not yet migrated ──
export interface WorldIdProof {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: string;
}

const VERIFY_V2_BASE = "https://developer.world.org/api/v2/verify";

export async function verifyWorldId(
  proof: WorldIdProof,
  appId: string,
  action: string,
  signal?: string,
): Promise<VerifyResult> {
  const payload: Record<string, string> = {
    merkle_root: proof.merkle_root,
    nullifier_hash: proof.nullifier_hash,
    proof: proof.proof,
    verification_level: proof.verification_level,
    action,
  };
  if (signal) payload.signal = signal;

  const url = `${VERIFY_V2_BASE}/${appId}`;
  console.log("[WORLD-ID-v2] POST", url, "action:", action);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("[WORLD-ID-v2] Response:", res.status, JSON.stringify(data));

  if (!res.ok) return { success: false, ...data };
  return { success: true, nullifier: proof.nullifier_hash, ...data };
}
