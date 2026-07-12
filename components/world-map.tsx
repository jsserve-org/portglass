"use client";

import React from "react";

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

const W = 640;
const H = 300;

export default function WorldMap({
  lat,
  lon,
  countryIso,
  label,
  token,
}: {
  lat?: number | null;
  lon?: number | null;
  countryIso?: string | null;
  label?: string;
  token?: string | null; // Mapbox public token, supplied at runtime by the server
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
  const zoom = precise ? 9 : 3.4;

  if (!hasPoint || !token) {
    return (
      <div className="worldmap worldmap-empty">
        <span className="worldmap-coord">{token ? "NO GEO FIX" : "MAP UNCONFIGURED"}</span>
        <span className="worldmap-place">
          {token ? label || "Location unavailable" : "Set MAPBOX_TOKEN to enable the map"}
        </span>
      </div>
    );
  }

  // Mapbox Static Images API — a marker over the location on the dark basemap.
  const marker = `pin-l+10b981(${plotLon},${plotLat})`;
  const src = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${marker}/${plotLon},${plotLat},${zoom},0/${W}x${H}@2x?access_token=${token}`;
  const external = `https://www.google.com/maps/@${plotLat},${plotLon},${precise ? 11 : 5}z`;

  return (
    <div className="worldmap">
      <a href={external} target="_blank" rel="noreferrer" className="worldmap-link" title="Open in maps">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Map of ${label || "host location"}`} className="worldmap-img" width={W} height={H} loading="lazy" />
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
