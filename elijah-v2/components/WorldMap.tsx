'use client';

import { useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';
import { motion } from 'framer-motion';
import { MOVEMENT_DOTS } from '@/data/mapData';

const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface TooltipState {
  x: number;
  y: number;
  country: string;
  count: number;
}

export default function WorldMap() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  return (
    <div className="relative w-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 130,
          center: [15, 25],
        }}
        style={{ width: '100%', height: 'auto' }}
        height={500}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1a1a1a"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={0.5}
                style={{
                  default: { outline: 'none' },
                  hover: { outline: 'none', fill: '#222' },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        {MOVEMENT_DOTS.map((dot, i) => (
          <Marker key={dot.country} coordinates={dot.coordinates}>
            {/* Pulsing ring */}
            <motion.circle
              r={Math.max(3, Math.min(8, dot.count / 25))}
              fill="rgba(255,255,255,0.08)"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={0.5}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{
                duration: 2.5,
                delay: i * 0.08,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            {/* Core dot */}
            <motion.circle
              r={Math.max(2, Math.min(5, dot.count / 40))}
              fill="#f0ede8"
              opacity={0.9}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.9, scale: 1 }}
              transition={{
                duration: 0.5,
                delay: 0.5 + i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              onMouseEnter={(e) => {
                const rect = (
                  e.currentTarget.closest('svg') as SVGSVGElement
                )?.getBoundingClientRect();
                if (rect) {
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    country: dot.country,
                    count: dot.count,
                  });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            />
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
          Members from {tooltip.country}
        </div>
      )}
    </div>
  );
}
