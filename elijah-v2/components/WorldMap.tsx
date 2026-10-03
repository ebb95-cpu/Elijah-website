'use client';

import { useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { motion } from 'framer-motion';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldData from 'world-atlas/countries-110m.json';
import { MOVEMENT_DOTS } from '@/data/mapData';

interface TooltipState {
  x: number;
  y: number;
  country: string;
  count: number;
}

type CountryFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

const MAP_SIZE = {
  width: 960,
  height: 500,
};

const worldTopology = worldData as unknown as Topology<{
  countries: GeometryCollection;
}>;

const countryFeatures = feature(
  worldTopology,
  worldTopology.objects.countries
) as CountryFeatureCollection;

const projection = geoMercator()
  .scale(130)
  .center([15, 25])
  .translate([MAP_SIZE.width / 2, MAP_SIZE.height / 2]);

const pathGenerator = geoPath(projection);

function projectPoint(coordinates: [number, number]) {
  return projection(coordinates) ?? [0, 0];
}

export default function WorldMap() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  return (
    <div className="relative w-full">
      <svg
        aria-label="Faith and Consistency audience map"
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
      >
        <g>
          {countryFeatures.features.map((country, index) => {
            const path = pathGenerator(country);

            return path ? (
              <path
                key={`${country.id ?? 'country'}-${index}`}
                d={path}
                fill="#1a1a1a"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={0.5}
              />
            ) : null;
          })}
        </g>

        {MOVEMENT_DOTS.map((dot, i) => {
          const [x, y] = projectPoint(dot.coordinates);
          const ringRadius = Math.max(3, Math.min(8, dot.count / 25));
          const dotRadius = Math.max(2, Math.min(5, dot.count / 40));

          return (
            <g key={dot.country} transform={`translate(${x} ${y})`}>
              <motion.circle
                r={ringRadius}
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
              <motion.circle
                r={dotRadius}
                fill="#f0ede8"
                opacity={0.9}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.9, scale: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 0.5 + i * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
                onMouseEnter={(event) => {
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    country: dot.country,
                    count: dot.count,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'default' }}
              />
            </g>
          );
        })}
      </svg>

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
