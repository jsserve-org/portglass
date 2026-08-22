import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Served by a custom server (server.js) that also hosts the scan-status
  // WebSocket, so the standalone output is no longer used.
  // Don't advertise the framework version on every response.
  poweredByHeader: false,
};

export default nextConfig;
