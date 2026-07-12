"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Shield, Plus, Search, Boxes, Zap } from "lucide-react";
import AuthNav from "./auth-nav";
import ScanModal from "./scan-modal";

const LINKS = [
  { href: "/", label: "Search", Icon: Search },
  { href: "/devices", label: "Devices", Icon: Boxes },
  { href: "/scans", label: "Scans", Icon: Zap },
];

/**
 * The single shared top navigation for every page. It owns the logo, section
 * links (auto-highlighted from the current path), the global "New Scan" button
 * + modal, and the signed-in user account — so the nav is identical everywhere
 * and pages don't have to wire any of it up. `active`/`right` remain optional
 * overrides for one-off cases.
 */
export default function TopNav({
  active,
  right,
}: {
  active?: string;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [showScan, setShowScan] = useState(false);

  // Derive the highlighted section from the path so /host/<ip> lights up Hosts,
  // /scan/<id> lights up Scans, etc. Callers may still override with `active`.
  const current =
    active ??
    (pathname.startsWith("/host") || pathname.startsWith("/devices")
      ? "/devices"
      : pathname.startsWith("/scan")
      ? "/scans"
      : "/");

  return (
    <>
      <nav className="topnav">
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
          <button className="scan-btn" onClick={() => setShowScan(true)}>
            <Plus size={14} /> New Scan
          </button>
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
        <button className="mobile-nav-item" onClick={() => setShowScan(true)}>
          <Plus size={20} />
          <span>New Scan</span>
        </button>
      </nav>

      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onStarted={() => {
            // Started scans live on the Scans page; go there so the new run is
            // visible regardless of which page launched it.
            router.push("/scans");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
