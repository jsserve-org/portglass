"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Search, Boxes, Zap, TerminalSquare, Globe } from "lucide-react";
import AuthNav from "./auth-nav";

const LINKS = [
  { href: "/", label: "Search", Icon: Search },
  { href: "/devices", label: "Devices", Icon: Boxes },
  { href: "/domains", label: "Domains", Icon: Globe },
  { href: "/scans", label: "Scans", Icon: Zap },
  { href: "/cli", label: "CLI", Icon: TerminalSquare },
];

/**
 * The single shared top navigation for every page. It owns the logo, section
 * links (auto-highlighted from the current path), and the signed-in user
 * account. Starting a scan (one-off or recurring) lives on the Scans page, so
 * the nav no longer carries a "New Scan" button. `active`/`right` remain
 * optional overrides for one-off cases.
 */
export default function TopNav({
  active,
  right,
}: {
  active?: string;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();

  // Derive the highlighted section from the path so /host/<ip> lights up Hosts,
  // /scan/<id> lights up Scans, etc. Callers may still override with `active`.
  const current =
    active ??
    (pathname.startsWith("/host") || pathname.startsWith("/devices")
      ? "/devices"
      : pathname.startsWith("/domains")
      ? "/domains"
      : pathname.startsWith("/cli")
      ? "/cli"
      : pathname.startsWith("/scan")
      ? "/scans"
      : "/");

  return (
    <>
      <nav className="topnav" aria-label="Primary">
        <div className="nav-left">
          <Link href="/" className="logo">
            <Shield size={22} />
            <span>portglass</span>
          </Link>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${current === l.href ? " active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          {right}
          <AuthNav />
        </div>
      </nav>

      {/* Mobile bottom navigation: centered, tappable section icons. */}
      <nav className="mobile-nav" aria-label="Primary">
        {LINKS.map((l) => {
          const Icon = l.Icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`mobile-nav-item${current === l.href ? " active" : ""}`}
            >
              <Icon size={20} />
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
