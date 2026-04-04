"use client";

import { QRCodeSVG } from "qrcode.react";

interface QrDisplayProps {
  payload: Record<string, unknown>;
  size?: number;
}

export function QrDisplay({ payload, size = 200 }: QrDisplayProps) {
  const data = JSON.stringify(payload);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4">
        <QRCodeSVG value={data} size={size} level="M" />
      </div>
      <p className="text-xs text-muted-foreground">
        Montre ce QR à la borne
      </p>
    </div>
  );
}
