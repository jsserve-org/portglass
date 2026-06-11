import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Served by a custom server (server.js) that also hosts the scan-status
  // WebSocket, so the standalone output is no longer used.
};

export default nextConfig;
