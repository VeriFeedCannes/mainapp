"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Home, Trophy, User, Shield } from "lucide-react";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/rewards", icon: Trophy, label: "Rewards" },
  { href: "/deposit", icon: User, label: "Profile" },
  { href: "/admin", icon: Shield, label: "Admin" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isConnected } = useAuth();

  if (!isConnected) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className={isActive ? "font-semibold" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
