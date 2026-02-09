"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/create", label: "Create Lock" },
  { href: "/locks", label: "My Locks" },
  { href: "/burn", label: "Burn" },
  { href: "/explore", label: "Explorer" },
  { href: "/token", label: "Token Search" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-card-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-primary">
              MegaLock
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-primary/10 text-primary"
                      : "text-muted hover:text-foreground hover:bg-card"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
