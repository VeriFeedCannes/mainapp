"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/card";
import { BadgeItem } from "@/components/badge-item";
import { useAuth } from "@/lib/auth-context";
import { useMiniKit } from "@/lib/minikit-provider";
import { Trophy, Medal, Crown, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { MiniKit, VerificationLevel } from "@worldcoin/minikit-js";

type Tab = "badges" | "leaderboard";

const ALL_BADGES = [
  { id: "first-return", icon: "🍽️", title: "First Return", description: "Return your first tray" },
  { id: "regular-3", icon: "🔄", title: "Regular (x3)", description: "Return 3 trays" },
  { id: "committed-7", icon: "💪", title: "Committed (x7)", description: "Return 7 trays" },
  { id: "streak-3", icon: "🔥", title: "3-Day Streak", description: "3 consecutive days" },
  { id: "streak-7", icon: "⚡", title: "7-Day Streak", description: "7 consecutive days" },
  { id: "clean-return", icon: "✨", title: "Clean Return", description: "Return a perfectly clean tray" },
  { id: "sorting-pro", icon: "♻️", title: "Sorting Pro", description: "5 correct sorts in a row" },
  { id: "community-goal", icon: "🌍", title: "Community Goal", description: "Help reach today's goal" },
  { id: "premium-unlocked", icon: "👁️", title: "Premium Claim", description: "Complete iris enrollment" },
];

interface LeaderEntry {
  wallet: string;
  username: string;
  score: number;
  returns: number;
}

export default function RewardsPage() {
  const [tab, setTab] = useState<Tab>("badges");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const { isConnected, walletAddress } = useAuth();
  const { isReady: isInWorldApp } = useMiniKit();

  const [userBadges, setUserBadges] = useState<string[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [totalReturns, setTotalReturns] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/user?wallet=${encodeURIComponent(walletAddress)}`);
      const data = await res.json();
      if (data.user) {
        setUserBadges(data.user.badges ?? []);
        setTotalScore(data.user.total_score ?? 0);
        setTotalReturns(data.user.total_returns ?? 0);
      }
      if (data.rank) setRank(data.rank);
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch { /* silent */ }
  }, [walletAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClaimReward = async () => {
    setClaimLoading(true);
    setClaimError(null);

    if (!isInWorldApp) {
      await new Promise((r) => setTimeout(r, 1500));
      setClaimSuccess(true);
      setClaimLoading(false);
      return;
    }

    try {
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: "claim-reward",
        verification_level: VerificationLevel.Orb,
      });

      if (finalPayload.status === "error") {
        setClaimError("Verification denied");
        setClaimLoading(false);
        return;
      }

      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: finalPayload, action: "claim-reward" }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.status === 200) {
        setClaimSuccess(true);
      } else {
        setClaimError("Verification failed. Already claimed?");
      }
    } catch (e: unknown) {
      setClaimError(e instanceof Error ? e.message : "Error");
    }

    setClaimLoading(false);
  };

  const badgesWithStatus = ALL_BADGES.map((b) => ({
    ...b,
    unlocked: userBadges.includes(b.id),
  }));

  const hasActivity = totalReturns > 0;

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <div>
        <h1 className="text-2xl font-bold">Rewards</h1>
        <p className="text-sm text-muted-foreground">Your badges & ranking</p>
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

      {/* Claim reward */}
      {claimError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {claimError}
        </div>
      )}

      <Card className="border-primary/30 bg-accent">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-accent-foreground">
              🎁 Free meal coupon
            </p>
            <p className="text-sm text-muted-foreground">Cost: 200 points</p>
          </div>
          {claimSuccess ? (
            <div className="flex items-center gap-1 rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white">
              <CheckCircle2 className="h-4 w-4" />
              Claimed
            </div>
          ) : (
            <button
              onClick={handleClaimReward}
              disabled={!isConnected || claimLoading || totalScore < 200}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {claimLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Claim"
              )}
            </button>
          )}
        </div>
        {!isInWorldApp && (
          <p className="mt-2 text-xs text-muted-foreground">
            Dev mode: World ID Verify will be simulated
          </p>
        )}
      </Card>
    </div>
  );
}
