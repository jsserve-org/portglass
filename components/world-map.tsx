"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// Approximate country centroids [lat, lon] — used to place the marker when we
// only have a country ISO code (MaxMind Country edition, no per-IP lat/lon).
// The City edition populates real coordinates and this fallback is skipped.
const CENTROIDS: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-14.2, -51.9],
  AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.3], PE: [-9.2, -75.0],
  GB: [54.0, -2.0], IE: [53.4, -8.2], FR: [46.6, 2.2], ES: [40.0, -3.7],
  PT: [39.6, -8.0], DE: [51.2, 10.4], NL: [52.1, 5.3], BE: [50.5, 4.5],
  CH: [46.8, 8.2], IT: [41.9, 12.6], AT: [47.5, 14.5], PL: [51.9, 19.1],
  CZ: [49.8, 15.5], SE: [60.1, 18.6], NO: [60.5, 8.5], FI: [61.9, 25.7],
  DK: [56.3, 9.5], RU: [61.5, 105.3], UA: [48.4, 31.2], RO: [45.9, 24.9],
  GR: [39.1, 21.8], TR: [38.9, 35.2], IL: [31.0, 34.8], SA: [23.9, 45.1],
  AE: [23.4, 53.8], IN: [20.6, 79.0], PK: [30.4, 69.3], BD: [23.7, 90.4],
  CN: [35.9, 104.2], JP: [36.2, 138.3], KR: [35.9, 127.8], TW: [23.7, 121.0],
  HK: [22.3, 114.2], SG: [1.35, 103.8], TH: [15.9, 100.9], VN: [14.1, 108.3],
  MY: [4.2, 101.9], ID: [-0.8, 113.9], PH: [12.9, 121.8], AU: [-25.3, 133.8],
  NZ: [-40.9, 174.9], ZA: [-30.6, 22.9], EG: [26.8, 30.8], NG: [9.1, 8.7],
  KE: [-0.0, 37.9], MA: [31.8, -7.1], DZ: [28.0, 1.7], ET: [9.1, 40.5],
};

const TILE = 256;
const MAX_TILES = 64;

// Web-Mercator projection to global pixel space at a given zoom.
function project(lon: number, lat: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Keyless static map: renders CARTO's dark basemap tiles around the plotted
 * point (Web-Mercator tile math), with an emerald pin at the center. This
 * replaced the Mapbox Static Images API after the account token started
 * returning 403 — tiles need no account, so the map can't break that way
 * again. Attribution is required and displayed on the canvas.
 */
export default function WorldMap({
  lat,
  lon,
  countryIso,
  label,
}: {
  lat?: number | null;
  lon?: number | null;
  countryIso?: string | null;
  label?: string;
}) {
  // Precise coordinates (City edition) beat the country centroid fallback.
  const precise = lat != null && lon != null;
  let plotLat = lat ?? null;
  let plotLon = lon ?? null;
  if (!precise && countryIso) {
    const c = CENTROIDS[countryIso.toUpperCase()];
    if (c) {
      plotLat = c[0];
      plotLon = c[1];
    }
  }
  const hasPoint = plotLat != null && plotLon != null;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = precise ? 9 : 4;

  const tiles = useMemo(() => {
    if (!hasPoint || !size.w || !size.h) return [];
    const n = 2 ** zoom;
    const center = project(plotLon!, plotLat!, zoom);
    const originX = center.x - size.w / 2;
    const originY = center.y - size.h / 2;
    const t0x = Math.floor(originX / TILE);
    const t1x = Math.floor((originX + size.w) / TILE);
    const t0y = Math.floor(originY / TILE);
    const t1y = Math.floor((originY + size.h) / TILE);
    const out: { key: string; src: string; left: number; top: number }[] = [];
    for (let tx = t0x; tx <= t1x; tx++) {
      for (let ty = t0y; ty <= t1y; ty++) {
        if (out.length >= MAX_TILES) break;
        if (ty < 0 || ty >= n) continue; // mercator top/bottom gap
        const wrappedX = ((tx % n) + n) % n;
        out.push({
          key: `${zoom}/${tx}/${ty}`,
          src: `https://basemaps.cartocdn.com/dark_all/${zoom}/${wrappedX}/${ty}.png`,
          left: tx * TILE - originX,
          top: ty * TILE - originY,
        });
      }
    }
    return out;
  }, [hasPoint, zoom, size.w, size.h, plotLat, plotLon]);

  const external = hasPoint
    ? `https://www.google.com/maps/@${plotLat},${plotLon},${precise ? 11 : 5}z`
    : "#";

  if (!hasPoint) {
    return (
      <div className="worldmap worldmap-empty">
        <span className="worldmap-coord">NO GEO FIX</span>
        <span className="worldmap-place">{label || "Location unavailable"}</span>
      </div>
    );
  }

  return (
    <div className="worldmap">
      <a href={external} target="_blank" rel="noreferrer" className="worldmap-link" title="Open in maps">
        <div ref={canvasRef} className="worldmap-canvas" aria-label={`Map of ${label || "host location"}`}>
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} loading="lazy" className="worldmap-tile" style={{ left: t.left, top: t.top }} />
          ))}
          <svg className="worldmap-pin" width={26} height={34} viewBox="0 0 26 34" style={{ left: "50%", top: "50%" }}>
            <path
              d="M13 0C5.8 0 0 5.8 0 13c0 9.1 10.9 19.1 12.2 20.3a1.2 1.2 0 0 0 1.6 0C15.1 32.1 26 22.1 26 13 26 5.8 20.2 0 13 0z"
              fill="#10b981"
              stroke="#03150e"
              strokeWidth="1.5"
            />
            <circle cx="13" cy="13" r="4.5" fill="#03150e" />
          </svg>
          <span className="worldmap-attrib">© OpenStreetMap contributors © CARTO</span>
        </div>
      </a>
      <div className="worldmap-readout">
        <span className="worldmap-coord">
          {Math.abs(plotLat!).toFixed(precise ? 4 : 1)}°{plotLat! >= 0 ? "N" : "S"} ·{" "}
          {Math.abs(plotLon!).toFixed(precise ? 4 : 1)}°{plotLon! >= 0 ? "E" : "W"}
        </span>
        <span className="worldmap-place">
          {label || "—"}
          {!precise && <span className="worldmap-approx"> · country-level</span>}
        </span>
      </div>
    </div>
  );
}
