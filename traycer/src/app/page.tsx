"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardTitle } from "@/components/card";
import { ScoreRing } from "@/components/score-ring";
import { ThemeToggle } from "@/components/theme-toggle";
import { PickupModal } from "@/components/pickup-modal";
import { ReturnModal } from "@/components/return-modal";
import { useAuth } from "@/lib/auth-context";
import { useMiniKit } from "@/lib/minikit-provider";
import {
  Flame,
  TrendingUp,
  Leaf,
  ChevronRight,
  Loader2,
  Nfc,
  Users,
  Target,
  Undo2,
  LogOut,
  Timer,
} from "lucide-react";
import { MiniKit } from "@worldcoin/minikit-js";
import Link from "next/link";

interface UserData {
  total_score: number;
  total_returns: number;
  current_streak: number;
  badges: string[];
}

interface LastDepositData {
  id: string;
  score: number;
  analysis: {
    items: Array<{
      name: string;
      consumption_state: string;
      estimated_percent_left: number;
    }>;
    tray_completeness: string;
    overall_confidence: number;
    notes: string;
  } | null;
  created_at: number;
}

interface CommunityData {
  trays_today: number;
  goal_today: number;
  trays_total: number;
}

export default function HomePage() {
  const { isConnected, walletAddress, username, plate, setPlate, setAuth, clearAuth } = useAuth();
  const { isReady: isInWorldApp } = useMiniKit();
  const [pickupOpen, setPickupOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [userData, setUserData] = useState<UserData | null>(null);
  const [lastDeposit, setLastDeposit] = useState<LastDepositData | null>(null);
  const [community, setCommunity] = useState<CommunityData | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const [res, statusRes] = await Promise.all([
        fetch(`/api/user?wallet=${encodeURIComponent(walletAddress)}`),
        fetch(`/api/session/status?wallet=${encodeURIComponent(walletAddress)}`),
      ]);
      const data = await res.json();
      const statusData = await statusRes.json();

      if (data.user) setUserData(data.user);
      if (data.last_deposit) setLastDeposit(data.last_deposit);
      if (data.community) setCommunity(data.community);

      if (statusData.plate) {
        setPlate({
          nfcUid: statusData.plate.nfc_uid,
          associatedAt: statusData.plate.associated_at,
        });
      } else {
        setPlate(null);
      }
    } catch { /* silent */ }
  }, [walletAddress, setPlate]);

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchDashboard();
      const interval = setInterval(fetchDashboard, 15000);
      return () => clearInterval(interval);
    }
  }, [isConnected, walletAddress, fetchDashboard]);

  const [arxStatus, setArxStatus] = useState<string | null>(null);

  const handleConnectArx = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    setArxStatus("Tap your wristband on the station…");

    const POLL_INTERVAL = 1000;
    const POLL_TIMEOUT = 30_000;
    const start = Date.now();

    try {
      while (Date.now() - start < POLL_TIMEOUT) {
        const res = await fetch("/api/auth/arx-status");
        const data = await res.json();

        if (data.ready && data.address) {
          const addr = data.address as string;
          const displayName = `Wristband ${addr.slice(0, 6)}…${addr.slice(-4)}`;
          setAuth(addr, displayName);
          setArxStatus(null);
          setAuthLoading(false);
          return;
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
      setArxStatus("Timeout — try again");
    } catch {
      setArxStatus("Connection error — try again");
    }
    setAuthLoading(false);
  };

  const handleConnectWorld = async () => {
    setAuthLoading(true);
    try {
      const nonceRes = await fetch("/api/nonce");
      const { nonce } = await nonceRes.json();

      const result = await MiniKit.walletAuth({
        nonce,
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        statement: "Connect to VeriFeed — every meal counts",
      });

      if (result.executedWith === "fallback") {
        setAuthLoading(false);
        return;
      }

      const { address, message, signature } = result.data;

      const verifyRes = await fetch("/api/auth/complete-siwe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: { address, message, signature },
          nonce,
        }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.isValid) {
        let displayName = address.slice(0, 6) + "..." + address.slice(-4);
        try {
          const user = await MiniKit.getUserByAddress(address);
          if (user?.username) displayName = user.username;
        } catch { /* optional */ }
        setAuth(address, displayName);
      }
    } catch { /* silent */ }
    setAuthLoading(false);
  };

  const handleConnect = isInWorldApp ? handleConnectWorld : handleConnectArx;

  // Elapsed timer since pickup
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!plate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [plate]);

  const elapsed = useMemo(() => {
    if (!plate) return "00:00";
    const secs = Math.max(0, Math.floor((now - plate.associatedAt) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [plate, now]);

  // ===================== LANDING (not connected) =====================
  if (!isConnected) {
    return (
      <div className="flex min-h-[85vh] flex-col items-center justify-center gap-8 px-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">VeriFeed</h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            Every meal counts.<br />
            Earn rewards. Make an impact.
          </p>
        </div>

        <button
          onClick={handleConnect}
          disabled={authLoading}
          className="flex items-center gap-2 rounded-full bg-primary px-10 py-3.5 text-base font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
        >
          {authLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {arxStatus ?? "Connecting…"}
            </>
          ) : (
            isInWorldApp ? "Connect with World" : (
              <>
                <Nfc className="h-5 w-5" />
                Connect with Wristband
              </>
            )
          )}
        </button>

        {!authLoading && arxStatus && (
          <p className="text-sm text-destructive">{arxStatus}</p>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    );
  }

  // ===================== DASHBOARD (connected) =====================
  const score = userData?.total_score ?? 0;
  const returns = userData?.total_returns ?? 0;
  const streak = userData?.current_streak ?? 0;
  const hasActivity = returns > 0;

  const timeAgo = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Hey,</p>
          <h1 className="text-2xl font-bold">{username}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={clearAuth}
            className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
            title="Disconnect"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Plate status + CTA */}
      {plate ? (
        <button
          onClick={() => setReturnModalOpen(true)}
          className="flex w-full items-center justify-between rounded-xl bg-accent px-4 py-3 transition-colors active:bg-accent/80"
        >
          <div className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-primary" />
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">Return tray</span>
              <span className="font-mono text-[10px] text-muted-foreground">{plate.nfcUid}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Timer className="h-3 w-3" />
              {elapsed}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      ) : (
        <button
          onClick={() => { setPickupOpen(true); setLoading(true); }}
          disabled={loading && pickupOpen}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Nfc className="h-5 w-5" />
          Grab a tray
        </button>
      )}

      {/* Empty state */}
      {!hasActivity && (
        <Card className="flex flex-col items-center gap-3 py-8">
          <span className="text-4xl">🍽️</span>
          <p className="text-center text-sm text-muted-foreground">
            No returns yet. Grab a tray and return it to start earning!
          </p>
        </Card>
      )}

      {/* Score + Streak (only if has activity) */}
      {hasActivity && (
        <Card className="flex items-center justify-around py-6">
          <ScoreRing score={score} maxScore={Math.max(500, score + 100)} label="Total score" />
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-lg font-bold text-accent-foreground">{streak}</span>
            </div>
            <span className="text-xs text-muted-foreground">day streak</span>

            <div className="mt-2 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5">
              <Leaf className="h-4 w-4 text-green-500" />
              <span className="text-sm font-semibold text-accent-foreground">{returns}</span>
            </div>
            <span className="text-xs text-muted-foreground">trays returned</span>
          </div>
        </Card>
      )}

      {/* Last deposit */}
      {lastDeposit && (
        <Link href={`/deposit?id=${lastDeposit.id}`}>
          <Card className="group cursor-pointer transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <CardTitle>Last return</CardTitle>
              <span className="text-xs text-muted-foreground">
                {timeAgo(lastDeposit.created_at)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                {lastDeposit.analysis && (
                  <>
                    <p className="text-sm">
                      {lastDeposit.analysis.items.length} items detected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lastDeposit.analysis.items.map((i) => i.name).join(", ")}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                  +{lastDeposit.score} pts
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Community stats */}
      {community && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Community
          </CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center rounded-lg bg-muted/50 py-3">
              <span className="text-2xl font-bold">{community.trays_today}</span>
              <span className="text-xs text-muted-foreground">trays today</span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-muted/50 py-3">
              <span className="text-2xl font-bold">{community.trays_total}</span>
              <span className="text-xs text-muted-foreground">all time</span>
            </div>
          </div>
          {/* Goal bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                Today&apos;s goal
              </span>
              <span>{community.trays_today}/{community.goal_today}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (community.trays_today / community.goal_today) * 100)}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Quick stats */}
      {hasActivity && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardTitle>Badges</CardTitle>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold">{userData?.badges.length ?? 0}</span>
              <span className="text-sm text-muted-foreground">unlocked</span>
            </div>
          </Card>
          <Link href="/rewards">
            <Card className="group cursor-pointer transition-shadow hover:shadow-md">
              <CardTitle className="flex items-center gap-1">
                Rewards
                <TrendingUp className="h-3 w-3 text-green-500" />
              </CardTitle>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-sm text-primary font-medium">View all →</span>
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* Modals */}
      <PickupModal open={pickupOpen} onClose={() => { setPickupOpen(false); setLoading(false); fetchDashboard(); }} />
      <ReturnModal open={returnModalOpen} onClose={() => { setReturnModalOpen(false); fetchDashboard(); }} />
    </div>
  );
}
