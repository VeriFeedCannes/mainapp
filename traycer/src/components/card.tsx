import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl border bg-card p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: CardProps) {
  return <div className={`mb-3 ${className}`}>{children}</div>;
}

export function CardTitle({
  children,
  className = "",
}: CardProps) {
  return (
    <h3 className={`text-sm font-semibold text-muted-foreground ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className = "",
}: CardProps) {
  return <div className={className}>{children}</div>;
}
