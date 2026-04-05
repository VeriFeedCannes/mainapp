"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardTitle } from "@/components/card";
import {
  Users,
  Coffee,
  Utensils,
  ShieldCheck,
  Loader2,
  Link2,
  Camera,
  ChevronDown,
  ChevronUp,
  Target,
  DollarSign,
} from "lucide-react";

interface AdminUser {
  wallet: string;
  username: string;
  total_score: number;
  total_returns: number;
  badges: string[];
  world_id_verified: boolean;
  created_at: number;
}

interface TrayItem {
  name: string;
  category: string;
  estimated_percent_left: number;
  estimated_cost_usd: number;
  consumption_state: string;
  confidence: number;
}

interface TrayAnalysis {
  items: TrayItem[];
  tray_completeness: string;
  overall_confidence: number;
  estimated_total_waste_usd: number;
  notes: string;
}

interface AdminDeposit {
  id: string;
  wallet: string;
  nfc_uid: string;
  score: number;
  photo_stored: boolean;
  analysis: TrayAnalysis | null;
  created_at: number;
}

interface AdminRedemption {
  id: string;
  wallet: string;
  badgeId: number;
  couponCode: string;
  txHash: string;
  createdAt: number;
}

interface CommunityStats {
  trays_today: number;
  trays_total: number;
  goal_today: number;
}

const STATE_LABELS: Record<string, string> = {
  fully_eaten: "Fully eaten",
  mostly_eaten: "Mostly eaten",
  half_left: "Half left",
  mostly_left: "Mostly left",
  untouched: "Untouched",
};

const STATE_COLORS: Record<string, string> = {
  fully_eaten: "bg-green-500",
  mostly_eaten: "bg-emerald-400",
  half_left: "bg-yellow-400",
  mostly_left: "bg-orange-400",
  untouched: "bg-red-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  protein: "bg-red-400",
  starch: "bg-amber-400",
  vegetable: "bg-green-500",
  fruit: "bg-pink-400",
  dairy: "bg-blue-300",
  bread: "bg-yellow-600",
  dessert: "bg-purple-400",
  beverage: "bg-cyan-400",
  other: "bg-gray-400",
};

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [deposits, setDeposits] = useState<AdminDeposit[]>([]);
  const [redemptions, setRedemptions] = useState<AdminRedemption[]>([]);
  const [community, setCommunity] = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDeposit, setExpandedDeposit] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard");
      const data = await res.json();
      if (data.users) setUsers(data.users);
      if (data.deposits) setDeposits(data.deposits);
      if (data.redemptions) setRedemptions(data.redemptions);
      if (data.community) setCommunity(data.community);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const walletMap = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...users].sort((a, b) => a.created_at - b.created_at);
    sorted.forEach((u, i) => {
      map.set(u.wallet.toLowerCase(), `User #${i + 1}`);
    });
    return map;
  }, [users]);

  const anon = (wallet: string) =>
    walletMap.get(wallet.toLowerCase()) ?? "Unknown";

  const allItems = useMemo(() => {
    const items: TrayItem[] = [];
    for (const d of deposits) {
      if (d.analysis) items.push(...d.analysis.items);
    }
    return items;
  }, [deposits]);

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) {
      const cat = item.category || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allItems]);

  const consumptionStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) {
      const state = item.consumption_state || "untouched";
      counts[state] = (counts[state] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allItems]);

  const avgWaste = useMemo(() => {
    if (allItems.length === 0) return 0;
    const sum = allItems.reduce((s, i) => s + i.estimated_percent_left, 0);
    return Math.round(sum / allItems.length);
  }, [allItems]);

  const totalWasteCost = useMemo(() => {
    let sum = 0;
    for (const d of deposits) {
      if (d.analysis?.estimated_total_waste_usd) {
        sum += d.analysis.estimated_total_waste_usd;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [deposits]);

  const goalPct = community
    ? Math.min(100, Math.round((community.trays_today / community.goal_today) * 100))
    : 0;

  const maxCat = categoryStats.length > 0 ? categoryStats[0][1] : 1;
  const totalConsumption = consumptionStats.reduce((s, [, c]) => s + c, 0) || 1;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">Event overview</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="flex flex-col items-center py-3">
          <Users className="h-5 w-5 text-primary" />
          <span className="mt-1 text-lg font-bold">{users.length}</span>
          <span className="text-xs text-muted-foreground">Participants</span>
        </Card>
        <Card className="flex flex-col items-center py-3">
          <Utensils className="h-5 w-5 text-orange-500" />
          <span className="mt-1 text-lg font-bold">{community?.trays_total ?? 0}</span>
          <span className="text-xs text-muted-foreground">Returns</span>
        </Card>
        <Card className="flex flex-col items-center py-3">
          <Coffee className="h-5 w-5 text-green-600" />
          <span className="mt-1 text-lg font-bold">{redemptions.length}</span>
          <span className="text-xs text-muted-foreground">Coupons</span>
        </Card>
        <Card className="flex flex-col items-center py-3">
          <DollarSign className="h-5 w-5 text-red-500" />
          <span className="mt-1 text-lg font-bold">${totalWasteCost.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">Food wasted</span>
        </Card>
      </div>

      {/* Daily goal */}
      {community && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Daily Goal
          </CardTitle>
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{community.trays_today} / {community.goal_today} trays</span>
              <span className="text-muted-foreground">{goalPct}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Food Analytics */}
      {allItems.length > 0 && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-4 w-4" />
            Food Analytics
          </CardTitle>

          {/* Average waste */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-primary">{avgWaste}%</span>
              <span className="text-[10px] text-muted-foreground">avg left</span>
            </div>
            <div className="flex-1">
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-orange-400 transition-all"
                  style={{ width: `${avgWaste}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Average food remaining across {allItems.length} items
              </p>
            </div>
          </div>

          {/* Categories */}
          <div className="mt-5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Food categories</p>
            <div className="flex flex-col gap-1.5">
              {categoryStats.map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-16 text-[11px] capitalize text-muted-foreground truncate">{cat}</span>
                  <div className="flex-1 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${CATEGORY_COLORS[cat] || "bg-gray-400"} transition-all`}
                      style={{ width: `${Math.round((count / maxCat) * 100)}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-[11px] font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Consumption states */}
          <div className="mt-5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Consumption breakdown</p>
            <div className="flex flex-col gap-1.5">
              {consumptionStats.map(([state, count]) => {
                const pct = Math.round((count / totalConsumption) * 100);
                return (
                  <div key={state} className="flex items-center gap-2">
                    <span className="w-20 text-[11px] text-muted-foreground truncate">
                      {STATE_LABELS[state] || state}
                    </span>
                    <div className="flex-1 h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${STATE_COLORS[state] || "bg-gray-400"} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-[11px] font-medium">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Active Coupons */}
      {redemptions.length > 0 && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="h-4 w-4" />
            Active Coupons
          </CardTitle>
          <div className="mt-3 flex flex-col gap-3">
            {redemptions.map((r) => (
              <div
                key={r.id}
                className="flex flex-col items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4"
              >
                <span className="text-2xl">☕</span>
                <span className="font-mono text-xl font-bold tracking-widest text-primary">
                  {r.couponCode}
                </span>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{anon(r.wallet)}</span>
                  <span>·</span>
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
                <a
                  href={`https://worldscan.org/tx/${r.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Link2 className="h-3 w-3" />
                  View transaction ↗
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Returns */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Utensils className="h-4 w-4" />
          Recent Returns ({deposits.length})
        </CardTitle>
        <div className="mt-3 flex flex-col gap-2">
          {deposits.slice(0, 20).map((d) => {
            const isExpanded = expandedDeposit === d.id;
            return (
              <div key={d.id} className="rounded-lg bg-muted/50">
                <button
                  onClick={() => setExpandedDeposit(isExpanded ? null : d.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    {d.photo_stored ? (
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Utensils className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        +{d.score} pts
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {anon(d.wallet)} · {timeAgo(d.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.analysis && (
                      <span className="text-[10px] text-muted-foreground">
                        {d.analysis.items.length} items · {d.analysis.tray_completeness.replace("_", " ")}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t px-3 pb-3 pt-2">
                    {d.photo_stored && (
                      <div className="mb-3 overflow-hidden rounded-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/deposit/photo?id=${d.id}`}
                          alt="Tray"
                          className="w-full object-cover"
                          style={{ maxHeight: 200 }}
                        />
                      </div>
                    )}

                    {d.analysis && d.analysis.items.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {d.analysis.estimated_total_waste_usd > 0 && (
                          <div className="flex items-center gap-2 rounded-md bg-orange-500/10 px-2 py-1.5 mb-1">
                            <DollarSign className="h-3 w-3 text-orange-500" />
                            <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                              ~${d.analysis.estimated_total_waste_usd.toFixed(2)} wasted
                            </span>
                          </div>
                        )}
                        {d.analysis.items.map((item, i) => (
                          <div
                            key={`${item.name}-${i}`}
                            className="flex items-center justify-between text-xs"
                          >
                            <div className="flex flex-col">
                              <span className="capitalize">{item.name}</span>
                              {item.estimated_cost_usd > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  ~${item.estimated_cost_usd.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {item.estimated_percent_left}% left
                              </span>
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  item.consumption_state === "fully_eaten" || item.consumption_state === "mostly_eaten"
                                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                    : item.consumption_state === "half_left"
                                      ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                                      : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                }`}
                              >
                                {item.consumption_state.replace("_", " ")}
                              </span>
                            </div>
                          </div>
                        ))}
                        {d.analysis.notes && (
                          <p className="mt-1 text-[10px] text-muted-foreground italic">
                            {d.analysis.notes}
                          </p>
                        )}
                        <p className="text-right text-[10px] text-muted-foreground">
                          Confidence: {Math.round(d.analysis.overall_confidence * 100)}%
                        </p>
                      </div>
                    )}

                    {!d.analysis && !d.photo_stored && (
                      <p className="text-xs text-muted-foreground">No analysis data</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {deposits.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No returns yet
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
