'use client';

import { useState, useEffect } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from 'react-simple-maps';
import { motion } from 'framer-motion';
import { JOURNEY_STOPS } from '@/data/journey';

const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface TooltipState {
  x: number;
  y: number;
  label: string;
}

export default function JourneyMap() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!mounted) return null;

  const lineCoordinates = JOURNEY_STOPS.map((s) => s.coordinates);

  return (
    <div className="relative w-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 160,
          center: [-20, 35],
        }}
        style={{ width: '100%', height: 'auto' }}
        height={480}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#161616"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={0.5}
                style={{
                  default: { outline: 'none' },
                  hover: { outline: 'none', fill: '#1e1e1e' },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        {/* Connecting path (desktop only) */}
        {!isMobile && (
          <Line
            coordinates={lineCoordinates}
            stroke="rgba(240,237,232,0.2)"
            strokeWidth={1}
            strokeDasharray="4 6"
            fill="none"
          />
        )}

        {/* Career stop markers */}
        {JOURNEY_STOPS.map((stop, i) => (
          <Marker key={stop.id} coordinates={stop.coordinates}>
            <motion.circle
              r={5}
              fill="#090909"
              stroke="#f0ede8"
              strokeWidth={1.5}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.4,
                delay: 0.3 + i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              onMouseEnter={(e) => {
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  label: `${stop.id}. ${stop.city} — ${stop.team ?? stop.country}`,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            />
            <motion.text
              textAnchor="middle"
              y={-10}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: 7,
                fill: 'rgba(240,237,232,0.6)',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.12 }}
            >
              {stop.id}
            </motion.text>
          </Marker>
        ))}
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 36,
            position: 'fixed',
          }}
        >
          {tooltip.label}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {JOURNEY_STOPS.map((stop) => (
          <div key={stop.id} className="flex items-center gap-1.5">
            <span className="font-body text-[9px] text-dim">{stop.id}.</span>
            <span className="font-body text-[9px] text-muted">{stop.city}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
