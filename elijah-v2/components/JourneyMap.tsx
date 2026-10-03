'use client';

import { useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { motion } from 'framer-motion';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldData from 'world-atlas/countries-110m.json';
import { JOURNEY_STOPS } from '@/data/journey';

interface TooltipState {
  x: number;
  y: number;
  label: string;
}

type CountryFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

const MAP_SIZE = {
  width: 960,
  height: 480,
};

const worldTopology = worldData as unknown as Topology<{
  countries: GeometryCollection;
}>;

const countryFeatures = feature(
  worldTopology,
  worldTopology.objects.countries
) as CountryFeatureCollection;

const projection = geoMercator()
  .scale(160)
  .center([-20, 35])
  .translate([MAP_SIZE.width / 2, MAP_SIZE.height / 2]);

const pathGenerator = geoPath(projection);

function projectPoint(coordinates: [number, number]) {
  return projection(coordinates) ?? [0, 0];
}

export default function JourneyMap() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const linePath = JOURNEY_STOPS.map((stop, index) => {
    const [x, y] = projectPoint(stop.coordinates);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="relative w-full">
      <svg
        aria-label="Elijah Bryant career journey map"
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
                fill="#161616"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={0.5}
              />
            ) : null;
          })}
        </g>

        {/* Connecting path (desktop only) */}
        <path
          className="hidden md:block"
          d={linePath}
          stroke="rgba(240,237,232,0.2)"
          strokeWidth={1}
          strokeDasharray="4 6"
          fill="none"
        />

        {/* Career stop markers */}
        {JOURNEY_STOPS.map((stop, i) => {
          const [x, y] = projectPoint(stop.coordinates);

          return (
          <g key={stop.id} transform={`translate(${x} ${y})`}>
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
