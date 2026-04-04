"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { X, Loader2, CheckCircle2, Nfc, Camera, PartyPopper } from "lucide-react";

type ReturnStep = "waiting" | "detected" | "capturing" | "done";

interface ReturnModalProps {
  open: boolean;
  onClose: () => void;
}

interface DepositResult {
  id: string;
  score: number;
  photo_stored: boolean;
}

type ConfettiKind = "circle" | "pill" | "ribbon";

function ConfettiBurst({ burstId }: { burstId: number }) {
  const pieces = useMemo(() => {
    const kinds: ConfettiKind[] = ["circle", "pill", "ribbon"];
    return Array.from({ length: 56 }, (_, i) => {
      const kind = kinds[i % 3];
      const hue = (i * 41 + burstId * 7) % 360;
      const sat = 58 + (i % 5) * 6;
      const light = 52 + (i % 4) * 5;
      return {
        i,
        kind,
        left: `${(i * 17 + 3 + (i % 7)) % 92}%`,
        tx: `${(i % 15 - 7) * 22 + (i % 3) * 8}px`,
        delay: `${(i % 16) * 28}ms`,
        duration: `${2.4 + (i % 8) * 0.16}s`,
        rot: `${(i * 47) % 360}deg`,
        gradient: `linear-gradient(135deg, hsl(${hue} ${sat}% ${light}%) 0%, hsl(${(hue + 28) % 360} ${sat + 8}% ${light - 8}%) 100%)`,
        shadow: `0 0 10px hsla(${hue}, 80%, 55%, 0.35)`,
      };
    });
  }, [burstId]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => {
        const base = "absolute -top-4 will-change-transform";
        const shape =
          p.kind === "circle"
            ? "h-2 w-2 rounded-full"
            : p.kind === "pill"
              ? "h-1.5 w-3.5 rounded-full"
              : "h-2 w-1.5 rounded-sm";
        return (
          <span
            key={p.i}
            className={`${base} ${shape}`}
            style={{
              left: p.left,
              background: p.gradient,
              boxShadow: p.shadow,
              animation: `traycer-confetti-fall ${p.duration} cubic-bezier(0.22,0.61,0.36,1) ${p.delay} forwards`,
              ["--confetti-tx" as string]: p.tx,
              ["--confetti-rot" as string]: p.rot,
            }}
          />
        );
      })}
    </div>
  );
}

export function ReturnModal({ open, onClose }: ReturnModalProps) {
  const { walletAddress, setPlate } = useAuth();
  const [step, setStep] = useState<ReturnStep>("waiting");
  const [deposit, setDeposit] = useState<DepositResult | null>(null);
  const [confettiBurstId, setConfettiBurstId] = useState(0);
  const [doneLoading, setDoneLoading] = useState(false);
  const stepRef = useRef<ReturnStep>("waiting");
  const mountedRef = useRef(true);

  const updateStep = useCallback((s: ReturnStep) => {
    stepRef.current = s;
    setStep(s);
  }, []);

  const triggerConfetti = useCallback(() => {
    setConfettiBurstId((n) => n + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      updateStep("waiting");
      setDeposit(null);
      setConfettiBurstId(0);
      setDoneLoading(false);
    }
  }, [open, updateStep]);

  // Signal polling — auto-starts when modal opens in "waiting"
  useEffect(() => {
    if (!open || !walletAddress) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled || stepRef.current !== "waiting") return;
      try {
        const res = await fetch(
          `/api/return/signal?wallet=${encodeURIComponent(walletAddress)}`,
        );
        const data = await res.json();
        if (cancelled || stepRef.current !== "waiting") return;
        if (data.signal?.status === "waiting" || data.signal?.status === "capture") {
          updateStep("detected");
          triggerConfetti();
          return;
        }
      } catch { /* retry */ }
      if (!cancelled && stepRef.current === "waiting") {
        setTimeout(poll, 1500);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [open, walletAddress, updateStep, triggerConfetti]);

  const handleDone = useCallback(async () => {
    if (!walletAddress || stepRef.current !== "detected") return;
    updateStep("capturing");
    setDoneLoading(true);

    try {
      await fetch("/api/return/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, action: "capture" }),
      });
    } catch { /* continue */ }

    let attempts = 0;

    const pollResult = async () => {
      if (!mountedRef.current || stepRef.current === "done" || attempts >= 60) return;

      try {
        const statusRes = await fetch(
          `/api/session/status?wallet=${encodeURIComponent(walletAddress)}`,
        );
        const statusData = await statusRes.json();

        if (!statusData.plate) {
          setPlate(null);

          const userRes = await fetch(
            `/api/user?wallet=${encodeURIComponent(walletAddress)}`,
          );
          const userData = await userRes.json();

          if (userData.last_deposit) {
            setDeposit({
              id: userData.last_deposit.id,
              score: userData.last_deposit.score,
              photo_stored: userData.last_deposit.photo_stored,
            });
          }

          updateStep("done");
          triggerConfetti();
          return;
        }
      } catch { /* retry */ }

      attempts++;
      setTimeout(pollResult, 2000);
    };

    pollResult();
  }, [walletAddress, updateStep, triggerConfetti, setPlate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {confettiBurstId > 0 ? <ConfettiBurst burstId={confettiBurstId} /> : null}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 mb-[26px] w-full max-w-md rounded-2xl bg-card p-6 shadow-xl sm:mb-0">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-border"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2 px-2">
          <StepDot active={step === "waiting"} done={step !== "waiting"} label="1" />
          <div className={`h-0.5 flex-1 rounded-full transition-colors ${step !== "waiting" ? "bg-primary" : "bg-muted"}`} />
          <StepDot active={step === "detected"} done={step === "capturing" || step === "done"} label="2" />
          <div className={`h-0.5 flex-1 rounded-full transition-colors ${step === "capturing" || step === "done" ? "bg-primary" : "bg-muted"}`} />
          <StepDot active={step === "capturing"} done={step === "done"} label="3" />
        </div>

        {/* STEP 1: Waiting for NFC detection */}
        {step === "waiting" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
              <Nfc className="h-7 w-7 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-bold">Return your tray</h2>
            <div className="mt-2 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 px-6 py-6">
              <Nfc className="h-10 w-10 text-primary" />
              <p className="text-center font-medium">
                Place your tray on the station reader
              </p>
              <p className="text-center text-xs text-muted-foreground">
                The station will detect your tray automatically
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Waiting for NFC detection…
            </div>
          </div>
        )}

        {/* STEP 2: Tray detected — confetti shown, press Done */}
        {step === "detected" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
              <PartyPopper className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="text-xl font-bold">Tray detected!</h2>
            <p className="text-center text-sm text-muted-foreground">
              Arrange your plate nicely, then press the button below to take a photo and finish.
            </p>
            <button
              onClick={handleDone}
              disabled={doneLoading}
              className="mt-2 flex items-center gap-2 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100"
            >
              {doneLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Focusing…
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5" />
                  Take photo &amp; finish
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 3: Capturing photo */}
        {step === "capturing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
              <Camera className="h-7 w-7 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-bold">Taking photo…</h2>
            <p className="text-center text-sm text-muted-foreground">
              The station is capturing and analyzing your tray.
            </p>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* STEP 4: Done */}
        {step === "done" && deposit && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold">Tray returned!</h2>
            <span className="rounded-full bg-primary px-5 py-2 text-lg font-bold text-primary-foreground">
              +{deposit.score} pts
            </span>
            {deposit.photo_stored && (
              <p className="text-center text-xs text-muted-foreground">
                Photo saved — view it in your return history
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-2 rounded-full bg-primary px-8 py-2.5 font-semibold text-primary-foreground"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
        done
          ? "bg-green-500 text-white"
          : active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {done ? "✓" : label}
    </div>
  );
}
