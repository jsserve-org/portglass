"use client";

import {
  Camera,
  Printer,
  ShieldAlert,
  MonitorCog,
  Smartphone,
  TerminalSquare,
  Globe,
  Router,
  HardDrive,
  Database,
  Mail,
  Network,
  Phone,
  Cpu,
  Film,
  Layers,
  Split,
  Gamepad2,
  ServerCog,
  HelpCircle,
} from 'lucide-react';
import type { DeviceType } from '@/lib/classify';

// Icon + accent color per detected device type. Kept out of lib/classify.ts so
// the classifier stays dependency-free (it also runs server-side). Colours are
// distinct per type and independent of the app's accent.
const META: Record<DeviceType, { Icon: typeof Camera; color: string }> = {
  ipmi: { Icon: ServerCog, color: '#c4b5a0' },
  hypervisor: { Icon: Layers, color: '#94a3b8' },
  camera: { Icon: Camera, color: '#c084fc' },
  printer: { Icon: Printer, color: '#38bdf8' },
  voip: { Icon: Phone, color: '#818cf8' },
  'game-server': { Icon: Gamepad2, color: '#a3e635' },
  'media-server': { Icon: Film, color: '#e879f9' },
  nas: { Icon: HardDrive, color: '#4ade80' },
  database: { Icon: Database, color: '#f472b6' },
  'mail-server': { Icon: Mail, color: '#facc15' },
  'dns-server': { Icon: Network, color: '#2dd4bf' },
  router: { Icon: Router, color: '#fb923c' },
  firewall: { Icon: ShieldAlert, color: '#f59e0b' },
  'load-balancer': { Icon: Split, color: '#7dd3fc' },
  iot: { Icon: Cpu, color: '#fb7185' },
  'windows-server': { Icon: MonitorCog, color: '#60a5fa' },
  mobile: { Icon: Smartphone, color: '#a78bfa' },
  'ssh-server': { Icon: TerminalSquare, color: '#34d399' },
  'web-server': { Icon: Globe, color: '#22d3ee' },
  unknown: { Icon: HelpCircle, color: 'var(--text-muted)' },
};

// Color per device type, for charts/bars outside the badge itself.
export const DEVICE_COLORS = Object.fromEntries(
  Object.entries(META).map(([k, v]) => [k, v.color])
) as Record<DeviceType, string>;

export default function DeviceBadge({
  type,
  label,
  confidence,
  size = 'sm',
}: {
  type: DeviceType;
  label: string;
  confidence?: 'high' | 'medium' | 'low';
  size?: 'sm' | 'lg';
}) {
  if (type === 'unknown') return null;
  const { Icon, color } = META[type];
  const px = size === 'lg' ? 15 : 12;
  return (
    <span
      className={`device-badge device-badge-${size}`}
      style={{ color, borderColor: color }}
      title={confidence ? `Detected device type — ${confidence} confidence` : 'Detected device type'}
    >
      <Icon size={px} />
      {label}
      {confidence === 'low' && <span className="device-badge-q">?</span>}
    </span>
  );
}
