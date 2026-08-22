"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes, ArrowRight } from "lucide-react";
import TopNav from "./top-nav";
import DeviceBadge from "./device-badge";
import Link from "next/link";
import { deviceLabel, type DeviceType } from "@/lib/classify";
import type { DeviceTypeCount } from "@/lib/device-counts";

// Order + one-line description per device type, shown as the tile subtitle.
const CATALOG: { type: DeviceType; blurb: string }[] = [
  { type: "ipmi", blurb: "IPMI / iDRAC / iLO out-of-band management" },
  { type: "hypervisor", blurb: "ESXi, Proxmox and other hypervisors" },
  { type: "camera", blurb: "RTSP / ONVIF streams, NVRs and IP cameras" },
  { type: "printer", blurb: "JetDirect, IPP and LPD print services" },
  { type: "voip", blurb: "SIP / PBX and VoIP endpoints" },
  { type: "game-server", blurb: "Minecraft, Source and other game hosts" },
  { type: "media-server", blurb: "Plex, Jellyfin, DLNA and streaming" },
  { type: "nas", blurb: "Synology, QNAP, TrueNAS and network storage" },
  { type: "database", blurb: "MySQL, Postgres, MongoDB, Redis and more" },
  { type: "mail-server", blurb: "SMTP / IMAP / POP3 mail services" },
  { type: "dns-server", blurb: "Authoritative and resolver DNS" },
  { type: "router", blurb: "Home / edge routers and CPE gateways" },
  { type: "firewall", blurb: "Firewalls, gateways and VPN appliances" },
  { type: "load-balancer", blurb: "HAProxy, F5, Envoy and traffic managers" },
  { type: "iot", blurb: "MQTT, smart-home hubs and IoT devices" },
  { type: "windows-server", blurb: "Windows hosts exposing RDP / SMB" },
  { type: "mobile", blurb: "Phones & tablets (iOS lockdownd, Android ADB)" },
  { type: "ssh-server", blurb: "SSH / remote-shell endpoints" },
  { type: "web-server", blurb: "HTTP(S) servers and web apps" },
];

function DevicesInner({ initialTypes }: { initialTypes: DeviceTypeCount[] }) {
  const q = useQuery({
    queryKey: ["device-types"],
    queryFn: async () => {
      const res = await fetch("/api/device-types", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ types: DeviceTypeCount[] }>;
    },
    // Seed with the server-rendered counts so the grid shows real numbers on
    // first paint; still refresh every 30s for liveness.
    initialData: { types: initialTypes },
    initialDataUpdatedAt: 0,
    refetchInterval: 30000,
  });

  const counts = new Map((q.data?.types ?? []).map((t) => [t.device_type, t.count]));
  const totalClassified = [...counts.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="app">
      <TopNav active="/devices" />

      <div className="scan-detail-page">
        <div className="scan-detail-header">
          <h1>
            <Boxes size={18} />
            Devices
          </h1>
          <div className="scan-meta-bar">
            <span>{totalClassified.toLocaleString()} classified hosts across {counts.size} device type{counts.size === 1 ? "" : "s"}</span>
          </div>
        </div>

        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
          Every scanned host is auto-classified from its open ports and service
          banners. Pick a category to jump into a filtered search.
        </p>

        <div className="device-grid">
          {CATALOG.map(({ type, blurb }) => {
            const n = counts.get(type) ?? 0;
            const disabled = n === 0;
            const tile = (
              <div className={`device-tile ${disabled ? "device-tile-empty" : ""}`}>
                <div className="device-tile-top">
                  <DeviceBadge type={type} label={deviceLabel(type)} size="lg" />
                  {!disabled && <ArrowRight size={16} className="device-tile-arrow" />}
                </div>
                <span className="device-tile-count">{n.toLocaleString()}</span>
                <span className="device-tile-blurb">{blurb}</span>
              </div>
            );
            return disabled ? (
              <div key={type}>{tile}</div>
            ) : (
              <Link key={type} href={`/?device=${type}`} className="device-tile-link">
                {tile}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DevicesOverview({ initialTypes = [] }: { initialTypes?: DeviceTypeCount[] }) {
  return <DevicesInner initialTypes={initialTypes} />;
}
