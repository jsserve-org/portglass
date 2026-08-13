import CliControl from '@/components/cli-control';
import { Suspense } from 'react';

export default function CliPage() {
  return <Suspense fallback={<div className="app"><div className="loading-screen"><span className="spinner" /><p>Loading CLI control…</p></div></div>}><CliControl /></Suspense>;
}
