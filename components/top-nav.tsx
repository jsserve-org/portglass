import Link from "next/link";
import { Shield } from "lucide-react";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/hosts", label: "Hosts" },
  { href: "/scans", label: "Scans" },
];

/**
 * Shared top navigation used by every page. Pass `active` (the href of the
 * current section) to highlight it, and `right` for any page-specific actions
 * (e.g. the dashboard's New Scan button + auth controls).
 */
export default function TopNav({
  active,
  right,
}: {
  active?: string;
  right?: React.ReactNode;
}) {
  return (
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
            className={`nav-link${active === l.href ? " active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      {right && <div className="nav-right">{right}</div>}
    </nav>
  );
}
