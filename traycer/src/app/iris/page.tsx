"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/card";
import { useAuth } from "@/lib/auth-context";
import {
  Eye,
  Upload,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react";

type IrisStep = "idle" | "uploading" | "enrolled" | "error";

export default function IrisPage() {
  const { isConnected } = useAuth();
  const [step, setStep] = useState<IrisStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <Eye className="h-12 w-12 text-muted-foreground" />
        <p className="text-center text-muted-foreground">
          Connect your wallet first to access iris features.
        </p>
      </div>
    );
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("uploading");
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];

        const res = await fetch("/api/iris/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: base64, wallet: "demo" }),
        });

        const data = await res.json();

        if (data.status === "enrolled" || res.ok) {
          setStep("enrolled");
          setEnrolledAt(new Date().toLocaleTimeString());
        } else {
          setError(data.error || "Enrollment failed");
          setStep("error");
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setError("Upload failed");
      setStep("error");
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <div>
        <h1 className="text-2xl font-bold">Iris Enrollment</h1>
        <p className="text-sm text-muted-foreground">
          Bonus: secure your identity for premium claims
        </p>
      </div>

      <Card className="border-orange-500/20 bg-orange-500/5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
          <div>
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
              Demo mode
            </p>
            <p className="text-xs text-muted-foreground">
              Photo upload for demonstration. Not production-grade biometrics.
              Uses open-iris by World Foundation for template extraction.
            </p>
          </div>
        </div>
      </Card>

      {/* Enroll */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Enroll your iris
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a close-up photo of your eye. The backend will extract an iris
          template using open-iris.
        </p>

        {step === "idle" || step === "error" ? (
          <label className="mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 py-8 transition-colors hover:border-primary/50 hover:bg-accent/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              Choose an iris photo
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        ) : step === "uploading" ? (
          <div className="mt-4 flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Processing with open-iris…
            </span>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <p className="font-semibold">Iris enrolled</p>
            <p className="text-xs text-muted-foreground">
              Template stored off-chain at {enrolledAt}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </Card>

      {/* Premium claim info */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Premium Claims
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Once enrolled, you can claim premium physical rewards with an
          additional iris verification step. This adds a biometric layer on top
          of World ID Verify for high-value claims.
        </p>
        <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Flow: World ID Verify → Iris match → Reward delivered
        </div>
      </Card>
    </div>
  );
}
