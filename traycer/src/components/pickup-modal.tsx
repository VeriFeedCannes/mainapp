"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QrDisplay } from "@/components/qr-display";
import { useAuth } from "@/lib/auth-context";
import { X, Loader2, CheckCircle2, AlertCircle, Nfc } from "lucide-react";

interface PickupModalProps {
  open: boolean;
  onClose: () => void;
}

export function PickupModal({ open, onClose }: PickupModalProps) {
  const { walletAddress, setPlate } = useAuth();
  const [qrPayload, setQrPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    return () => { pollingRef.current = false; };
  }, []);

  useEffect(() => {
    if (open && !qrPayload && !done) {
      createSession();
    }
    if (!open) {
      pollingRef.current = false;
      setQrPayload(null);
      setDone(false);
      setError(null);
      setPolling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createSession = async () => {
    if (!walletAddress) return;
    setLoading(true);
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
        setLoading(false);
        return;
      }
      setQrPayload(data.qr_payload);
      setLoading(false);
      setPolling(true);
      pollForCompletion();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  const pollForCompletion = useCallback(() => {
    if (!walletAddress) return;
    pollingRef.current = true;
    let attempts = 0;

    const poll = async () => {
      if (!pollingRef.current || attempts >= 60) {
        setPolling(false);
        if (attempts >= 60) setError("Session expired. Try again.");
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
          setPolling(false);
          setDone(true);
          return;
        }
      } catch { /* retry */ }

      attempts++;
      setTimeout(poll, 2000);
    };

    poll();
  }, [walletAddress, setPlate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 mb-4 w-full max-w-md rounded-2xl bg-card p-6 shadow-xl sm:mb-0">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-border"
        >
          <X className="h-4 w-4" />
        </button>

        {done ? (
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
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <Nfc className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Grab a tray</h2>

            {error && (
              <div className="flex w-full items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Creating session…
              </div>
            )}

            {qrPayload && (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  Show this QR to the station, then place your tray on the NFC reader.
                </p>
                <QrDisplay payload={qrPayload} />
                {polling && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Waiting for NFC scan…
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
