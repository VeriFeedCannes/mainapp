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
  Gift,
} from "lucide-react";
import { MiniKit, VerificationLevel } from "@worldcoin/minikit-js";

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

interface RewardTier {
  id: string;
  title: string;
  cost: number;
  verification_level: "device" | "orb";
}

interface ClaimData {
  reward_type: string;
  created_at: number;
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

  const [tiers, setTiers] = useState<RewardTier[]>([]);
  const [userClaims, setUserClaims] = useState<ClaimData[]>([]);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const [userRes, claimsRes] = await Promise.all([
        fetch(`/api/user?wallet=${encodeURIComponent(walletAddress)}`),
        fetch(`/api/rewards/claim?wallet=${encodeURIComponent(walletAddress)}`),
      ]);
      const data = await userRes.json();
      const claimsData = await claimsRes.json();

      if (data.user) {
        setUserBadges(data.user.badges ?? []);
        setTotalScore(data.user.total_score ?? 0);
        setTotalReturns(data.user.total_returns ?? 0);
      }
      if (data.rank) setRank(data.rank);
      if (data.leaderboard) setLeaderboard(data.leaderboard);
      if (claimsData.tiers) setTiers(claimsData.tiers);
      if (claimsData.claims) setUserClaims(claimsData.claims);
    } catch { /* silent */ }
  }, [walletAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const badgesWithStatus = ALL_BADGES.map((b) => ({
    ...b,
    unlocked: userBadges.includes(b.id),
  }));

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
        hasActivity ? (
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
        )
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

      {/* Reward claims */}
      <div className="mt-2">
        <h2 className="mb-3 text-lg font-bold flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          Claim rewards
        </h2>
        <div className="flex flex-col gap-3">
          {tiers.map((tier) => (
            <RewardCard
              key={tier.id}
              tier={tier}
              totalScore={totalScore}
              isConnected={isConnected}
              isInWorldApp={isInWorldApp}
              walletAddress={walletAddress}
              alreadyClaimed={userClaims.some((c) => c.reward_type === tier.id)}
              onClaimed={fetchData}
            />
          ))}
          {tiers.length === 0 && (
            <Card className="flex flex-col items-center gap-3 py-8">
              <span className="text-4xl">🎁</span>
              <p className="text-center text-sm text-muted-foreground">
                Loading rewards…
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function RewardCard({
  tier,
  totalScore,
  isConnected,
  isInWorldApp,
  walletAddress,
  alreadyClaimed,
  onClaimed,
}: {
  tier: RewardTier;
  totalScore: number;
  isConnected: boolean;
  isInWorldApp: boolean;
  walletAddress: string | null;
  alreadyClaimed: boolean;
  onClaimed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(alreadyClaimed);

  const canAfford = totalScore >= tier.cost;
  const isOrb = tier.verification_level === "orb";

  const handleClaim = async () => {
    if (!walletAddress || loading || success) return;
    setLoading(true);
    setError(null);

    try {
      let proof;

      if (!isInWorldApp) {
        // Dev mode — simulate proof
        await new Promise((r) => setTimeout(r, 800));
        proof = {
          nullifier_hash: `dev_${walletAddress}_${tier.id}_${Date.now()}`,
          merkle_root: "dev",
          proof: "dev",
          verification_level: tier.verification_level,
          status: "success",
        };
      } else {
        const action = `claim-${tier.id}`;
        const verificationLevel = isOrb
          ? VerificationLevel.Orb
          : VerificationLevel.Device;

        const { finalPayload } = await MiniKit.commandsAsync.verify({
          action,
          signal: walletAddress,
          verification_level: verificationLevel,
        });

        if (finalPayload.status === "error") {
          setError("World ID verification denied");
          setLoading(false);
          return;
        }

        proof = finalPayload;
      }

      const res = await fetch("/api/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          reward_type: tier.id,
          proof,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        onClaimed();
      } else {
        setError(data.error || "Claim failed");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    }

    setLoading(false);
  };

  return (
    <Card className={success ? "border-green-500/30 bg-green-500/5" : "border-primary/20"}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="font-semibold text-card-foreground flex items-center gap-1.5">
            {tier.title}
            {isOrb && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                <ShieldCheck className="h-3 w-3" />
                Orb
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{tier.cost} points</p>
        </div>
        {success ? (
          <div className="flex items-center gap-1 rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white">
            <CheckCircle2 className="h-4 w-4" />
            Claimed
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={!isConnected || loading || !canAfford}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !canAfford ? (
              `Need ${tier.cost - totalScore} more`
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
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Dev mode — World ID verification will be simulated
        </p>
      )}
    </Card>
  );
}
