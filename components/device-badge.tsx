"use client";

import {
  Camera,
  Printer,
  ShieldAlert,
  MonitorCog,
  Smartphone,
  TerminalSquare,
  Globe,
  HelpCircle,
} from 'lucide-react';
import type { DeviceType } from '@/lib/classify';

// Icon + accent color per detected device type. Kept out of lib/classify.ts so
// the classifier stays dependency-free (it also runs server-side).
const META: Record<DeviceType, { Icon: typeof Camera; color: string }> = {
  camera: { Icon: Camera, color: '#c084fc' },
  printer: { Icon: Printer, color: 'var(--beam)' },
  firewall: { Icon: ShieldAlert, color: 'var(--amber)' },
  'windows-server': { Icon: MonitorCog, color: '#6ea8ff' },
  mobile: { Icon: Smartphone, color: '#a78bfa' },
  'ssh-server': { Icon: TerminalSquare, color: 'var(--signal)' },
  'web-server': { Icon: Globe, color: 'var(--beam)' },
  unknown: { Icon: HelpCircle, color: 'var(--text-muted)' },
};

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
  const px = size === 'lg' ? 16 : 12;
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
