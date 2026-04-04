interface BadgeItemProps {
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  txHash?: string | null;
}

export function BadgeItem({
  icon,
  title,
  description,
  unlocked,
  txHash,
}: BadgeItemProps) {
  const earnedTag = unlocked ? (
    txHash ? (
      <a
        href={`https://worldscan.org/tx/${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-80"
      >
        Earned ↗
      </a>
    ) : (
      <div className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
        Earned
      </div>
    )
  ) : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
        unlocked
          ? "border-primary/30 bg-accent"
          : "border-border bg-muted opacity-50"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${
          unlocked ? "bg-primary/20" : "bg-muted"
        }`}
      >
        {unlocked ? icon : "🔒"}
      </div>
      <div className="flex-1">
        <p
          className={`text-sm font-semibold ${
            unlocked ? "text-card-foreground" : "text-muted-foreground"
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {earnedTag}
    </div>
  );
}
