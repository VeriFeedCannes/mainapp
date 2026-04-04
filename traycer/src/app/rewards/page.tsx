"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/card";
import { BadgeItem } from "@/components/badge-item";
import { useAuth } from "@/lib/auth-context";
import { useMiniKit } from "@/lib/minikit-provider";
import {
  Trophy,
  Medal,
  Crown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Link2,
} from "lucide-react";
import { MiniKit } from "@worldcoin/minikit-js";
import { encodeFunctionData } from "viem";
import { IDKitRequestWidget, orbLegacy, type RpContext } from "@worldcoin/idkit";

type Tab = "badges" | "leaderboard";

const ALL_BADGES = [
  { id: "first-return", icon: "🍽️", title: "First Return", description: "Return your first tray" },
  { id: "regular-3", icon: "🔄", title: "Regular (x3)", description: "Return 3 trays" },
  { id: "committed-7", icon: "💪", title: "Committed (x7)", description: "Return 7 trays" },
  { id: "streak-3", icon: "🔥", title: "3-Day Streak", description: "3 consecutive days" },
  { id: "streak-7", icon: "⚡", title: "7-Day Streak", description: "7 consecutive days" },
  { id: "community-goal", icon: "🌍", title: "Community Goal", description: "Help reach today's goal" },
];

interface LeaderEntry {
  wallet: string;
  username: string;
  score: number;
  returns: number;
}

interface OnchainBadge {
  id: string;
  badgeId: number;
  claimType: string;
  txHash: string | null;
  mintedAt: number | null;
  source: string;
}

const BADGE_NAMES: Record<number, { label: string; icon: string }> = {
  1: { label: "First Return", icon: "🍽️" },
  2: { label: "Regular", icon: "🔄" },
  3: { label: "Committed", icon: "💪" },
  4: { label: "Premium", icon: "👁️" },
};

const BADGE_CONTRACT =
  process.env.NEXT_PUBLIC_BADGE_CONTRACT ??
  "0x8513e5cF11309B42fb7c30909F3a1e90E2aF2140";

const REDEEM_ABI = [
  {
    type: "function" as const,
    name: "redeemBadge",
    inputs: [{ name: "badgeId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
];

const MINT_BADGE_ABI = [
  {
    type: "function" as const,
    name: "mintBadge",
    inputs: [{ name: "badgeId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
];

interface Redemption {
  id: string;
  badgeId: number;
  rewardType: string;
  txHash: string;
  createdAt: number;
}

export default function RewardsPage() {
  const [tab, setTab] = useState<Tab>("badges");
  const { isConnected, walletAddress } = useAuth();
  const { isReady: isInWorldApp } = useMiniKit();

  const [userBadges, setUserBadges] = useState<string[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [totalReturns, setTotalReturns] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);

  const [onchainBadges, setOnchainBadges] = useState<OnchainBadge[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const [userRes, badgesRes, redemptionsRes] = await Promise.all([
        fetch(`/api/user?wallet=${encodeURIComponent(walletAddress)}`),
        fetch(`/api/badges/onchain?wallet=${encodeURIComponent(walletAddress)}`),
        fetch(`/api/badges/redemptions?wallet=${encodeURIComponent(walletAddress)}`),
      ]);
      const data = await userRes.json();
      const badgesData = await badgesRes.json();
      const redemptionsData = await redemptionsRes.json();

      if (data.user) {
        setUserBadges(data.user.badges ?? []);
        setTotalScore(data.user.total_score ?? 0);
        setTotalReturns(data.user.total_returns ?? 0);
      }
      if (data.rank) setRank(data.rank);
      if (data.leaderboard) setLeaderboard(data.leaderboard);
      if (badgesData.badges) setOnchainBadges(badgesData.badges);
      if (redemptionsData.redemptions) setRedemptions(redemptionsData.redemptions);
    } catch { /* silent */ }
  }, [walletAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const BADGE_TO_ONCHAIN: Record<string, number> = {
    "first-return": 1,
    "regular-3": 2,
    "committed-7": 3,
  };

  const badgesWithStatus = ALL_BADGES.map((b) => {
    const onchainId = BADGE_TO_ONCHAIN[b.id];
    const oc = onchainId
      ? onchainBadges.find((o) => o.badgeId === onchainId)
      : undefined;
    return {
      ...b,
      unlocked: userBadges.includes(b.id),
      txHash: oc?.txHash ?? null,
    };
  });

  const hasActivity = totalReturns > 0;

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Rewards</h1>
        <p className="text-sm text-muted-foreground">Your badges, ranking & claims</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="flex flex-col items-center py-3">
          <Trophy className="h-5 w-5 text-primary" />
          <span className="mt-1 text-lg font-bold">
            {badgesWithStatus.filter((b) => b.unlocked).length}
          </span>
          <span className="text-xs text-muted-foreground">Badges</span>
        </Card>
        <Card className="flex flex-col items-center py-3">
          <Medal className="h-5 w-5 text-orange-500" />
          <span className="mt-1 text-lg font-bold">{totalScore}</span>
          <span className="text-xs text-muted-foreground">Points</span>
        </Card>
        <Card className="flex flex-col items-center py-3">
          <Crown className="h-5 w-5 text-primary" />
          <span className="mt-1 text-lg font-bold">
            {rank ? `#${rank}` : "—"}
          </span>
          <span className="text-xs text-muted-foreground">Rank</span>
        </Card>
      </div>

      {/* ★ First Return — Hero Card ★ */}
      <FirstReturnHeroCard
        totalReturns={totalReturns}
        onchainBadges={onchainBadges}
        redemptions={redemptions}
        walletAddress={walletAddress}
        isConnected={isConnected}
        isInWorldApp={isInWorldApp}
        onRedeemed={fetchData}
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        <button
          onClick={() => setTab("badges")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === "badges" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Badges
        </button>
        <button
          onClick={() => setTab("leaderboard")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === "leaderboard" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Leaderboard
        </button>
      </div>

      {tab === "badges" ? (
        <>
          {hasActivity ? (
            <div className="flex flex-col gap-2">
              {badgesWithStatus.map((badge) => (
                <BadgeItem key={badge.id} {...badge} />
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center gap-3 py-8">
              <span className="text-4xl">🏅</span>
              <p className="text-center text-sm text-muted-foreground">
                Start returning trays to unlock badges
              </p>
            </Card>
          )}

          {/* On-chain badges (ERC-1155) — badges 2+ (badge #1 is in hero card) */}
          {onchainBadges.filter((b) => b.badgeId !== 1).length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                Other on-chain badges
              </h3>
              <div className="flex flex-col gap-2">
                {onchainBadges
                  .filter((b) => b.badgeId !== 1)
                  .map((b) => {
                    const meta = BADGE_NAMES[b.badgeId] ?? {
                      label: `Badge #${b.badgeId}`,
                      icon: "🏅",
                    };
                    return (
                      <Card key={b.id} className="border-primary/20">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-card-foreground">
                              {meta.label}
                              <span className="ml-2 inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                                ERC-1155
                              </span>
                            </p>
                            {b.mintedAt && (
                              <p className="text-xs text-muted-foreground">
                                Minted{" "}
                                {new Date(b.mintedAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          {b.txHash && (
                            <a
                              href={`https://worldscan.org/tx/${b.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-80"
                            >
                              Earned ↗
                            </a>
                          )}
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      ) : leaderboard.length > 0 ? (
        <Card>
          <CardTitle>Leaderboard</CardTitle>
          <div className="mt-3 flex flex-col gap-1">
            {leaderboard.map((player, i) => {
              const isUser = player.wallet === walletAddress;
              const rankNum = i + 1;
              return (
                <div
                  key={player.wallet}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    isUser ? "border border-primary/30 bg-accent" : "bg-muted/50"
                  }`}
                >
                  <span className="w-6 text-center text-sm font-bold">
                    {rankNum <= 3
                      ? ["🥇", "🥈", "🥉"][rankNum - 1]
                      : rankNum}
                  </span>
                  <span className={`flex-1 text-sm ${isUser ? "font-bold" : ""}`}>
                    {player.username}
                    {isUser && (
                      <span className="ml-1 text-xs text-primary">(you)</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {player.score} pts
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 py-8">
          <span className="text-4xl">📊</span>
          <p className="text-center text-sm text-muted-foreground">
            No ranking data yet
          </p>
        </Card>
      )}

      {/* Premium badge (World ID) */}
      <PremiumClaimCard
        walletAddress={walletAddress}
        isConnected={isConnected}
        isInWorldApp={isInWorldApp}
        alreadyClaimed={onchainBadges.some((b) => b.badgeId === 4)}
        onClaimed={fetchData}
      />

    </div>
  );
}

function FirstReturnHeroCard({
  totalReturns,
  onchainBadges,
  redemptions,
  walletAddress,
  isConnected,
  isInWorldApp,
  onRedeemed,
}: {
  totalReturns: number;
  onchainBadges: OnchainBadge[];
  redemptions: Redemption[];
  walletAddress: string | null;
  isConnected: boolean;
  isInWorldApp: boolean;
  onRedeemed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRedeemed, setJustRedeemed] = useState(false);
  const [redeemTxHash, setRedeemTxHash] = useState<string | null>(null);
  const [couponCode] = useState(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const seg = () =>
      Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `${seg()}-${seg()}-${seg()}`;
  });

  const badge1 = onchainBadges.find((b) => b.badgeId === 1);
  const redemption = redemptions.find((r) => r.badgeId === 1);

  type Status = "no_returns" | "pending" | "minted" | "redeemed";
  let status: Status;
  if (redemption || justRedeemed) status = "redeemed";
  else if (badge1) status = "minted";
  else if (totalReturns >= 1) status = "pending";
  else status = "no_returns";

  const txHash = redeemTxHash || redemption?.txHash;
  const mintTxHash = badge1?.txHash;

  const confirmRedemption = async (txH: string) => {
    try {
      const res = await fetch("/api/badges/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, badgeId: 1, txHash: txH }),
      });
      const data = await res.json();
      if (data.success || data.alreadyRedeemed) {
        setJustRedeemed(true);
        setRedeemTxHash(txH);
        onRedeemed();
      }
    } catch { /* silent */ }
  };

  const handleRedeem = async () => {
    if (!walletAddress || loading || status !== "minted") return;
    setLoading(true);
    setError(null);

    try {
      let txHashResult: string;

      if (!isInWorldApp) {
        await new Promise((r) => setTimeout(r, 1500));
        txHashResult =
          "0x" +
          Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16),
          ).join("");
      } else {
        const calldata = encodeFunctionData({
          abi: REDEEM_ABI,
          functionName: "redeemBadge",
          args: [BigInt(1)],
        });

        const result = await MiniKit.sendTransaction({
          chainId: 480,
          transactions: [
            {
              to: BADGE_CONTRACT as `0x${string}`,
              data: calldata,
              value: "0x0",
            },
          ],
        });

        if (result.executedWith === "fallback") {
          setError("Transaction cancelled");
          setLoading(false);
          return;
        }

        const { userOpHash } = result.data;

        // Resolve userOpHash → real transaction hash via World Developer API
        let resolvedHash = userOpHash;
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const opRes = await fetch(
              `https://developer.world.org/api/v2/minikit/userop/${userOpHash}`,
            );
            const opData = await opRes.json();
            if (opData.status === "success" && opData.transaction_hash) {
              resolvedHash = opData.transaction_hash;
              break;
            }
          } catch { /* retry */ }
        }

        txHashResult = resolvedHash;
      }

      await confirmRedemption(txHashResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    }

    setLoading(false);
  };

  const borderClass =
    status === "redeemed"
      ? "border-green-500/30 bg-green-500/5"
      : status === "minted"
        ? "border-primary/30"
        : "border-muted";

  const iconBgClass =
    status === "no_returns"
      ? "bg-muted"
      : status === "pending"
        ? "bg-amber-500/10"
        : "bg-primary/10";

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold flex items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        On-chain Badge
      </h2>
      <Card className={`relative overflow-hidden ${borderClass}`}>
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5" />
        <div className="relative flex flex-col gap-4">
          {/* Badge info */}
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${iconBgClass}`}
            >
              🍽️
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold">First Return</h3>
              <p className="text-xs text-muted-foreground">
                {status === "no_returns" && "Return a tray to earn this badge"}
                {status === "pending" && "Minting on World Chain…"}
                {status === "minted" && "Minted on World Chain"}
                {status === "redeemed" && "Badge redeemed"}
              </p>
            </div>
            {status === "minted" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Minted
              </span>
            )}
            {status === "pending" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Minting
              </span>
            )}
          </div>

          {/* Mint tx link */}
          {mintTxHash && status === "minted" && (
            <a
              href={`https://worldscan.org/tx/${mintTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              See transaction ↗
            </a>
          )}

          {/* Redeem section */}
          {status === "minted" && (
            <div className="rounded-xl border border-dashed border-primary/20 bg-primary/5 p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">☕</span>
                <div>
                  <p className="font-semibold">Coffee Coupon</p>
                  <p className="text-xs text-muted-foreground">
                    Exchange your badge for a free coffee
                  </p>
                </div>
              </div>
              <button
                onClick={handleRedeem}
                disabled={!isConnected || loading}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending transaction…
                  </span>
                ) : (
                  "Redeem for Coffee Coupon"
                )}
              </button>
              {!isInWorldApp && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Dev mode — sendTransaction will be simulated
                </p>
              )}
            </div>
          )}

          {/* Redeemed state */}
          {status === "redeemed" && (
            <div className="rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/5 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    Coffee coupon claimed
                  </p>
                </div>
                <span className="text-2xl">☕</span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Show this code at the counter
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-bold tracking-widest">
                    {couponCode}
                  </p>
                </div>
                <span className="text-3xl">☕</span>
              </div>
            </div>
          )}

          {/* No returns */}
          {status === "no_returns" && (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Return your first tray to unlock this badge and earn a coffee
              coupon
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PremiumClaimCard({
  walletAddress,
  isConnected,
  isInWorldApp,
  alreadyClaimed,
  onClaimed,
}: {
  walletAddress: string | null;
  isConnected: boolean;
  isInWorldApp: boolean;
  alreadyClaimed: boolean;
  onClaimed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(alreadyClaimed);
  const [txPending, setTxPending] = useState(false);

  const [idkitOpen, setIdkitOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);

  const appId = process.env.NEXT_PUBLIC_APP_ID ?? "";
  const rpId = process.env.NEXT_PUBLIC_RP_ID ?? "";

  const handleClaim = async () => {
    if (!walletAddress || loading || success) return;
    setLoading(true);
    setError(null);

    if (!isInWorldApp) {
      // Dev mode — skip IDKit, send without proof
      try {
        const res = await fetch("/api/chainlink/premium-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: walletAddress }),
        });
        const data = await res.json();
        if (data.success) {
          setSuccess(true);
          setTxPending(true);
          onClaimed();
        } else {
          setError(data.error || "Claim failed");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error");
      }
      setLoading(false);
      return;
    }

    // World App — fetch RP signature then open IDKit
    try {
      const rpRes = await fetch("/api/idkit/rp-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "premium-badge-claim" }),
      });
      const rpSig = await rpRes.json();

      if (rpSig.error) {
        setError(rpSig.error);
        setLoading(false);
        return;
      }

      setRpContext({
        rp_id: rpId,
        nonce: rpSig.nonce,
        created_at: rpSig.created_at,
        expires_at: rpSig.expires_at,
        signature: rpSig.sig,
      });
      setIdkitOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  };

  const [mintTxHash, setMintTxHash] = useState<string | null>(null);

  const handleVerify = async (result: unknown) => {
    // 1. Backend verifies proof + anti-doublon
    const res = await fetch("/api/chainlink/premium-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress, proof: result }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Backend verification failed");
    }
  };

  const handleSuccess = async () => {
    setIdkitOpen(false);

    // 2. Mint badge #4 on-chain via sendTransaction
    try {
      if (!isInWorldApp) {
        // Dev mode — fake tx
        await new Promise((r) => setTimeout(r, 1000));
        setMintTxHash("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
        setSuccess(true);
        setTxPending(false);
        setLoading(false);
        onClaimed();
        return;
      }

      setTxPending(true);

      const calldata = encodeFunctionData({
        abi: MINT_BADGE_ABI,
        functionName: "mintBadge",
        args: [BigInt(4)],
      });

      const txResult = await MiniKit.sendTransaction({
        chainId: 480,
        transactions: [
          {
            to: BADGE_CONTRACT as `0x${string}`,
            data: calldata,
            value: "0x0",
          },
        ],
      });

      if (txResult.executedWith === "fallback") {
        setError("Transaction cancelled");
        setLoading(false);
        setTxPending(false);
        return;
      }

      const { userOpHash } = txResult.data;

      // Resolve userOpHash → real transaction hash
      let resolvedHash = userOpHash;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const opRes = await fetch(
            `https://developer.world.org/api/v2/minikit/userop/${userOpHash}`,
          );
          const opData = await opRes.json();
          if (opData.status === "success" && opData.transaction_hash) {
            resolvedHash = opData.transaction_hash;
            break;
          }
        } catch { /* retry */ }
      }

      setMintTxHash(resolvedHash);
      setSuccess(true);
      setTxPending(false);
      onClaimed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Mint failed");
      setTxPending(false);
    }

    setLoading(false);
  };

  return (
    <div className="mt-4">
      <h2 className="mb-3 text-lg font-bold flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-purple-500" />
        Premium Badge
      </h2>
      <Card className={success ? "border-purple-500/30 bg-purple-500/5" : "border-purple-500/20"}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-semibold text-card-foreground flex items-center gap-1.5">
              World ID Verified
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                <ShieldCheck className="h-3 w-3" />
                Orb
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Prove your humanity to earn an exclusive on-chain badge
            </p>
          </div>
          {success ? (
            mintTxHash && !txPending ? (
              <a
                href={`https://worldscan.org/tx/${mintTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
              >
                <CheckCircle2 className="h-4 w-4" />
                Minted ↗
              </a>
            ) : (
              <div className="flex items-center gap-1 rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white">
                {txPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {txPending ? "Minting…" : "Claimed"}
              </div>
            )
          ) : (
            <button
              onClick={handleClaim}
              disabled={!isConnected || loading}
              className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Claim"
              )}
            </button>
          )}
        </div>
        {error && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
        {!isInWorldApp && !success && (
          <p className="mt-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
            Dev mode — World ID verification will be simulated
          </p>
        )}
      </Card>

      {rpContext && (
        <IDKitRequestWidget
          open={idkitOpen}
          onOpenChange={(open) => {
            setIdkitOpen(open);
            if (!open) setLoading(false);
          }}
          app_id={appId as `app_${string}`}
          action="premium-badge-claim"
          rp_context={rpContext}
          allow_legacy_proofs={true}
          preset={orbLegacy({ signal: walletAddress ?? "" })}
          handleVerify={handleVerify}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
