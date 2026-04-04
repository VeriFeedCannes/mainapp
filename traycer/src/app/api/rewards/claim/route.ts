import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { wallet, reward_type, world_id_verified, iris_verified } =
      await req.json();

    if (!wallet || !reward_type) {
      return NextResponse.json(
        { error: "wallet and reward_type are required" },
        { status: 400 },
      );
    }

    // TODO: Check user has enough points in Supabase
    // TODO: Check world_id_verified is true (proof already validated via /api/verify)
    // TODO: If premium reward, check iris_verified
    // TODO: Deduct points
    // TODO: Trigger Send Transaction on World Chain (mint badge / transfer reward)

    return NextResponse.json({
      success: true,
      reward_type,
      wallet,
      world_id_verified: world_id_verified ?? false,
      iris_verified: iris_verified ?? false,
      tx_hash: "0x" + "a".repeat(64),
      message: "Reward claimed (mock — World Chain not connected yet)",
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
