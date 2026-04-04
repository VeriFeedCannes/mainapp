"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QrDisplay } from "@/components/qr-display";
import { useAuth } from "@/lib/auth-context";
import { useMiniKit } from "@/lib/minikit-provider";
import { X, Loader2, CheckCircle2, AlertCircle, Nfc, ScanLine } from "lucide-react";

type ModalStep = "loading" | "identify" | "place-tray" | "done";

interface PickupModalProps {
  open: boolean;
  onClose: () => void;
}

export function PickupModal({ open, onClose }: PickupModalProps) {
  const { walletAddress, setPlate } = useAuth();
  const { isReady: isInWorldApp } = useMiniKit();
  const [qrPayload, setQrPayload] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<ModalStep>("loading");
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    return () => { pollingRef.current = false; };
  }, []);

  useEffect(() => {
    if (open) {
      pollingRef.current = false;
      setQrPayload(null);
      setStep("loading");
      setError(null);
      createSession();
    } else {
      pollingRef.current = false;
      setQrPayload(null);
      setStep("loading");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createSession = async () => {
    if (!walletAddress) return;
    setStep("loading");
    setError(null);

    try {
      const res = await fetch("/api/session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, action: "pickup" }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      if (isInWorldApp) {
        setQrPayload(data.qr_payload);
      }
      setStep("identify");
      startPolling();
    } catch {
      setError("Network error");
    }
  };

  const startPolling = useCallback(() => {
    if (!walletAddress) return;
    pollingRef.current = true;
    let attempts = 0;

    const poll = async () => {
      if (!pollingRef.current || attempts >= 90) {
        if (attempts >= 90) setError("Session expired. Try again.");
        return;
      }

      try {
        const res = await fetch(
          `/api/session/status?wallet=${encodeURIComponent(walletAddress)}`,
        );
        const data = await res.json();

        if (data.plate) {
          setPlate({
            nfcUid: data.plate.nfc_uid,
            associatedAt: data.plate.associated_at,
          });
          pollingRef.current = false;
          setStep("done");
          return;
        }

        if (data.session?.status === "scanned") {
          setStep("place-tray");
        }

        if (!data.session && !data.plate && step === "identify") {
          pollingRef.current = false;
          createSession();
          return;
        }
      } catch { /* retry */ }

      attempts++;
      setTimeout(poll, 1500);
    };

    poll();
  }, [walletAddress, setPlate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 mb-[26px] w-full max-w-md rounded-2xl bg-card p-6 shadow-xl sm:mb-0">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-border"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        {step !== "loading" && (
          <div className="mb-5 flex items-center gap-2 px-2">
            <StepDot active={step === "identify"} done={step === "place-tray" || step === "done"} label="1" />
            <div className={`h-0.5 flex-1 rounded-full transition-colors ${step === "place-tray" || step === "done" ? "bg-primary" : "bg-muted"}`} />
            <StepDot active={step === "place-tray"} done={step === "done"} label="2" />
            <div className={`h-0.5 flex-1 rounded-full transition-colors ${step === "done" ? "bg-primary" : "bg-muted"}`} />
            <StepDot active={false} done={step === "done"} label="3" />
          </div>
        )}

        {/* LOADING */}
        {step === "loading" && !error && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creating session…</p>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex w-full items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            <button
              onClick={createSession}
              className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
            >
              Retry
            </button>
          </div>
        )}

        {/* STEP 1 — World App: Show QR */}
        {step === "identify" && isInWorldApp && qrPayload && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <ScanLine className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Show QR to station</h2>
            <p className="text-center text-sm text-muted-foreground">
              Hold your phone in front of the station camera.
            </p>
            <QrDisplay payload={qrPayload} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Waiting for station to scan…
            </div>
          </div>
        )}

        {/* STEP 1 — Wristband: Tap wristband */}
        {step === "identify" && !isInWorldApp && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
              <Nfc className="h-7 w-7 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-bold">Tap your wristband</h2>
            <div className="mt-2 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 px-6 py-6">
              <Nfc className="h-10 w-10 text-primary" />
              <p className="text-center font-medium">
                Hold your wristband on the station reader
              </p>
              <p className="text-center text-xs text-muted-foreground">
                The station will identify you automatically
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Waiting for wristband…
            </div>
          </div>
        )}

        {/* STEP 2: Identity confirmed — Place tray */}
        {step === "place-tray" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="text-xl font-bold">
              {isInWorldApp ? "QR confirmed!" : "Wristband detected!"}
            </h2>
            <div className="mt-2 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 px-6 py-6">
              <Nfc className="h-10 w-10 text-primary animate-pulse" />
              <p className="text-center font-medium">
                Place your tray on the NFC reader
              </p>
              <p className="text-center text-xs text-muted-foreground">
                The station is waiting for your tray…
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Waiting for NFC…
            </div>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold">Tray linked!</h2>
            <p className="text-center text-sm text-muted-foreground">
              Your tray is now associated with your account. Return it to earn points.
            </p>
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
