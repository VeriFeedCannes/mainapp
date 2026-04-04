"use client";

import { Suspense, useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/card";
import { ScoreRing } from "@/components/score-ring";
import { useAuth } from "@/lib/auth-context";
import {
  CheckCircle2,
  Utensils,
  ArrowLeft,
  Camera,
  ChevronRight,
  Clock,
} from "lucide-react";
import Link from "next/link";

interface DepositData {
  id: string;
  score: number;
  nfc_uid: string;
  photo_stored: boolean;
  created_at: number;
  analysis: {
    items: Array<{
      name: string;
      category: string;
      course: string;
      estimated_percent_left: number;
      consumption_state: string;
      confidence: number;
    }>;
    tray_completeness: string;
    overall_confidence: number;
    notes: string;
  } | null;
}

export default function DepositPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>}>
      <DepositContent />
    </Suspense>
  );
}

function DepositContent() {
  const { walletAddress } = useAuth();
  const [deposit, setDeposit] = useState<DepositData | null>(null);
  const [allDeposits, setAllDeposits] = useState<DepositData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`/api/user?wallet=${encodeURIComponent(walletAddress)}`).then((r) => r.json()),
      fetch(`/api/user/deposits?wallet=${encodeURIComponent(walletAddress)}`).then((r) => r.json()),
    ])
      .then(([userData, depositsData]) => {
        if (userData.last_deposit) setDeposit(userData.last_deposit);
        if (depositsData.deposits) setAllDeposits(depositsData.deposits);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [walletAddress]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!deposit) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <span className="text-5xl">📭</span>
        <p className="text-center text-muted-foreground">
          No return data yet. Return a tray to see your results here.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground"
        >
          Back home
        </Link>
      </div>
    );
  }

  const analysis = deposit.analysis;

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
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-muted p-2 transition-colors hover:bg-border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Return result</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(deposit.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
      </div>

      {/* Photo */}
      {deposit.photo_stored && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Tray photo</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/deposit/photo?id=${deposit.id}`}
            alt="Tray photo"
            className="w-full object-cover"
            style={{ maxHeight: 240 }}
          />
        </Card>
      )}

      {/* Score */}
      <Card className="flex flex-col items-center gap-4 py-6">
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Tray returned</span>
        </div>
        <ScoreRing score={deposit.score} maxScore={10} label="Score" />
      </Card>

      {/* Score breakdown */}
      <Card>
        <CardTitle>Points breakdown</CardTitle>
        <div className="mt-3 flex flex-col gap-2">
          <ScoreLine
            icon={<Utensils className="h-4 w-4" />}
            label="Tray returned"
            points={10}
            highlight
          />
          <div className="mt-1 border-t pt-2">
            <div className="flex items-center justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">+{deposit.score} pts</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Item-level analysis */}
      {analysis && analysis.items.length > 0 && (
        <Card>
          <CardTitle>Tray items</CardTitle>
          <div className="mt-3 flex flex-col gap-2">
            {analysis.items.map((item, i) => (
              <div
                key={`${item.name}-${i}`}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium capitalize">{item.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {item.category} · {item.course}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {item.estimated_percent_left}% left
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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
          </div>
          {analysis.notes && (
            <p className="mt-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
              {analysis.notes}
            </p>
          )}
          <p className="mt-2 text-right text-xs text-muted-foreground">
            Confidence: {Math.round(analysis.overall_confidence * 100)}%
          </p>
        </Card>
      )}

      {/* Return history */}
      {allDeposits.length > 1 && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Return history
          </CardTitle>
          <div className="mt-3 flex flex-col gap-2">
            {allDeposits.map((d) => (
              <div
                key={d.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  d.id === deposit.id ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  {d.photo_stored ? (
                    <Camera className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">+{d.score} pts</span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(d.created_at)}
                    </span>
                  </div>
                </div>
                {d.photo_stored && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Photo</span>
                    <ChevronRight className="h-3 w-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ScoreLine({
  icon,
  label,
  points,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  points: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={highlight ? "text-green-500" : "text-muted-foreground"}>
          {icon}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      <span
        className={`text-sm font-semibold ${highlight ? "text-green-500" : "text-foreground"}`}
      >
        +{points}
      </span>
    </div>
  );
}
