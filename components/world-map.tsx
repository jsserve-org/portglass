"use client";

import React from "react";

/**
 * Custom dotted equirectangular world map. No external map library — landmasses
 * are approximated with coarse lon/lat polygons and rasterised into a dot grid,
 * giving the "signals console" look. A marker is plotted at the host location.
 *
 * Coordinate space == viewBox space: x = lon + 180 (0..360), y = 90 - lat (0..180).
 */

type LonLat = [number, number];

// Approximate continental outlines in [lon, lat]. Crude on purpose — they only
// need to read as a recognisable world at dot-matrix resolution.
const LAND: LonLat[][] = [
  // North America
  [[-168, 65], [-160, 71], [-95, 72], [-60, 68], [-52, 47], [-66, 44], [-81, 25], [-97, 18], [-105, 20], [-115, 30], [-125, 40], [-130, 50], [-140, 58], [-168, 65]],
  // Central America
  [[-105, 20], [-92, 14], [-83, 8], [-77, 8], [-83, 15], [-95, 16], [-105, 20]],
  // South America
  [[-81, 8], [-60, 10], [-50, 0], [-35, -7], [-40, -23], [-48, -25], [-58, -35], [-65, -42], [-73, -52], [-75, -45], [-70, -18], [-81, -5], [-81, 8]],
  // Greenland
  [[-45, 60], [-30, 60], [-20, 70], [-30, 82], [-50, 80], [-55, 70], [-45, 60]],
  // Europe
  [[-10, 36], [-10, 44], [-5, 48], [0, 51], [2, 58], [10, 64], [28, 70], [42, 66], [42, 50], [28, 45], [20, 40], [10, 38], [0, 38], [-10, 36]],
  // UK / Ireland
  [[-8, 50], [-2, 52], [-2, 58], [-7, 57], [-10, 53], [-8, 50]],
  // Africa
  [[-17, 21], [-17, 32], [10, 37], [32, 32], [44, 12], [51, 12], [41, -5], [40, -18], [35, -28], [20, -35], [12, -28], [8, 4], [-8, 5], [-17, 15], [-17, 21]],
  // Asia (bulk)
  [[42, 66], [60, 72], [100, 78], [140, 72], [160, 68], [180, 68], [180, 60], [170, 60], [145, 45], [140, 35], [125, 38], [122, 30], [120, 22], [108, 18], [100, 8], [95, 8], [80, 8], [72, 22], [60, 25], [45, 38], [42, 50], [42, 66]],
  // India peninsula refinement
  [[70, 24], [88, 22], [82, 8], [76, 8], [72, 16], [70, 24]],
  // SE Asia / Indonesia
  [[95, 6], [120, 2], [135, -3], [141, -8], [120, -10], [100, -2], [95, 6]],
  // Japan
  [[130, 33], [138, 35], [142, 43], [140, 40], [134, 34], [130, 33]],
  // Australia
  [[113, -22], [122, -18], [131, -12], [142, -11], [150, -22], [153, -28], [146, -38], [138, -35], [129, -32], [115, -34], [113, -22]],
  // New Zealand
  [[167, -45], [174, -41], [178, -38], [172, -42], [167, -45]],
];

function pointInPolygon(x: number, y: number, poly: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const STEP = 3; // degrees between dots

function buildDots(): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  for (let lat = 80; lat >= -56; lat -= STEP) {
    for (let lon = -180; lon <= 180; lon += STEP) {
      if (LAND.some((poly) => pointInPolygon(lon, lat, poly))) {
        dots.push({ x: lon + 180, y: 90 - lat });
      }
    }
  }
  return dots;
}

const DOTS = buildDots();

// Approximate country centroids [lat, lon] — used to place the marker when we
// only have a country ISO code (MaxMind country-level geo, no city/lat-lon).
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
  let plotLat = lat ?? null;
  let plotLon = lon ?? null;
  if ((plotLat == null || plotLon == null) && countryIso) {
    const c = CENTROIDS[countryIso.toUpperCase()];
    if (c) {
      plotLat = c[0];
      plotLon = c[1];
    }
  }

  const hasPoint = plotLat != null && plotLon != null;
  const mx = hasPoint ? plotLon! + 180 : 0;
  const my = hasPoint ? 90 - plotLat! : 0;

  return (
    <div className="worldmap">
      <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" className="worldmap-svg">
        {/* graticule */}
        <g className="worldmap-grat">
          {[30, 60, 90, 120, 150].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="360" y2={y} />
          ))}
          {[60, 120, 180, 240, 300].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="180" />
          ))}
        </g>
        {/* land dots */}
        <g className="worldmap-dots">
          {DOTS.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="0.7" />
          ))}
        </g>
        {/* marker */}
        {hasPoint && (
          <g className="worldmap-marker" transform={`translate(${mx} ${my})`}>
            <circle className="ring ring-3" r="9" />
            <circle className="ring ring-2" r="5.5" />
            <circle className="ring ring-1" r="2.6" />
            <circle className="core" r="1.3" />
            <line className="cross" x1="-13" y1="0" x2="-11" y2="0" />
            <line className="cross" x1="13" y1="0" x2="11" y2="0" />
            <line className="cross" x1="0" y1="-13" x2="0" y2="-11" />
            <line className="cross" x1="0" y1="13" x2="0" y2="11" />
          </g>
        )}
      </svg>
      {hasPoint ? (
        <div className="worldmap-readout">
          <span className="worldmap-coord">
            {Math.abs(lat!).toFixed(4)}°{lat! >= 0 ? "N" : "S"} · {Math.abs(lon!).toFixed(4)}°{lon! >= 0 ? "E" : "W"}
          </span>
          {label && <span className="worldmap-place">{label}</span>}
        </div>
      ) : (
        <div className="worldmap-readout worldmap-readout-empty">
          <span className="worldmap-coord">NO GEO FIX</span>
          <span className="worldmap-place">{label || "Location unavailable"}</span>
        </div>
      )}
    </div>
  );
}
