"use client";

import { Suspense, useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/card";
import { ScoreRing } from "@/components/score-ring";
import { useAuth } from "@/lib/auth-context";
import {
  CheckCircle2,
  Utensils,
  BarChart3,
  Recycle,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface DepositData {
  id: string;
  score: number;
  nfc_uid: string;
  created_at: number;
  analysis: {
    items: Array<{
      name: string;
      estimated_percent_left: number;
      category: string;
    }>;
    waste_percent: number;
    sorting_correct: boolean;
    clean_return: boolean;
    confidence: number;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }
    fetch(`/api/user?wallet=${encodeURIComponent(walletAddress)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.last_deposit) {
          setDeposit(data.last_deposit);
        }
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
  const wastePercent = analysis?.waste_percent ?? 0;

  const scoreBreakdown = {
    returned: 10,
    lowWaste: wastePercent < 25 ? 5 : 0,
    veryLowWaste: wastePercent < 10 ? 3 : 0,
    sorting: analysis?.sorting_correct ? 3 : 0,
    clean: analysis?.clean_return ? 4 : 0,
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

      {/* Score */}
      <Card className="flex flex-col items-center gap-4 py-6">
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Tray returned</span>
        </div>
        <ScoreRing score={deposit.score} maxScore={25} label="Score" />
      </Card>

      {/* Score breakdown */}
      <Card>
        <CardTitle>Points breakdown</CardTitle>
        <div className="mt-3 flex flex-col gap-2">
          <ScoreLine
            icon={<Utensils className="h-4 w-4" />}
            label="Tray returned"
            points={scoreBreakdown.returned}
          />
          {scoreBreakdown.lowWaste > 0 && (
            <ScoreLine
              icon={<BarChart3 className="h-4 w-4" />}
              label={`Low waste (${wastePercent}%)`}
              points={scoreBreakdown.lowWaste}
              highlight
            />
          )}
          {scoreBreakdown.veryLowWaste > 0 && (
            <ScoreLine
              icon={<BarChart3 className="h-4 w-4" />}
              label="Very low waste bonus"
              points={scoreBreakdown.veryLowWaste}
              highlight
            />
          )}
          {scoreBreakdown.sorting > 0 && (
            <ScoreLine
              icon={<Recycle className="h-4 w-4" />}
              label="Correct sorting"
              points={scoreBreakdown.sorting}
              highlight
            />
          )}
          {scoreBreakdown.clean > 0 && (
            <ScoreLine
              icon={<Sparkles className="h-4 w-4" />}
              label="Clean return"
              points={scoreBreakdown.clean}
              highlight
            />
          )}
          <div className="mt-1 border-t pt-2">
            <div className="flex items-center justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">+{deposit.score} pts</span>
            </div>
          </div>
        </div>
      </Card>

      {/* AI analysis */}
      {analysis && (
        <Card>
          <CardTitle>AI Analysis</CardTitle>
          <div className="mt-3 flex flex-col gap-2">
            {analysis.items.map((item, i) => (
              <div
                key={`${item.name}-${i}`}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
              >
                <span className="text-sm capitalize">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {item.estimated_percent_left}% left
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      item.estimated_percent_left > 50
                        ? "bg-orange-500/20 text-orange-600"
                        : "bg-green-500/20 text-green-600"
                    }`}
                  >
                    {item.category}
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
            Confidence: {Math.round(analysis.confidence * 100)}%
          </p>
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
