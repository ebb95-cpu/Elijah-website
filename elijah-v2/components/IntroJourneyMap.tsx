'use client';

import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { motion } from 'framer-motion';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldData from 'world-atlas/countries-110m.json';

const STOPS: { label: string; coordinates: [number, number] }[] = [
  { label: 'Atlanta',      coordinates: [-84.388,  33.749] },
  { label: 'N. Hampshire', coordinates: [-71.572,  43.194] },
  { label: 'Elon',         coordinates: [-79.512,  36.100] },
  { label: 'BYU',          coordinates: [-111.658, 40.234] },
  { label: 'Eilat',        coordinates: [34.952,   29.558] },
  { label: 'Tel Aviv',     coordinates: [34.782,   32.085] },
  { label: 'Milwaukee',    coordinates: [-87.907,  43.039] },
  { label: 'Istanbul',     coordinates: [28.978,   41.008] },
  { label: "Ha'poel",      coordinates: [34.800,   32.200] },
];

type CountryFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

const MAP_SIZE = {
  width: 960,
  height: 540,
};

const worldTopology = worldData as unknown as Topology<{
  countries: GeometryCollection;
}>;

const countryFeatures = feature(
  worldTopology,
  worldTopology.objects.countries
) as CountryFeatureCollection;

const projection = geoNaturalEarth1()
  .scale(148)
  .center([-30, 38])
  .translate([MAP_SIZE.width / 2, MAP_SIZE.height / 2]);

const pathGenerator = geoPath(projection);

function projectPoint(coordinates: [number, number]) {
  return projection(coordinates) ?? [0, 0];
}

export default function IntroJourneyMap() {
  return (
    <motion.div
      className="w-full h-full flex items-center justify-center bg-black overflow-hidden"
      initial={{ scale: 1.06 }}
      animate={{ scale: 1 }}
      transition={{ duration: 6, ease: [0.16, 1, 0.3, 1] }}
    >
      <svg
        aria-label="Elijah Bryant journey map"
        className="h-full w-full"
        role="img"
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
      >
        {/* Base map — extremely subtle */}
        <g>
          {countryFeatures.features.map((country, index) => {
            const path = pathGenerator(country);

            return path ? (
              <path
                key={`${country.id ?? 'country'}-${index}`}
                d={path}
                fill="#141414"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={0.4}
              />
            ) : null;
          })}
        </g>

        {/* Connection lines — staggered reveal */}
        {STOPS.slice(0, -1).map((stop, i) => {
          const [x1, y1] = projectPoint(stop.coordinates);
          const [x2, y2] = projectPoint(STOPS[i + 1].coordinates);

          return (
            <motion.path
              key={`line-${i}`}
              d={`M ${x1} ${y1} L ${x2} ${y2}`}
              fill="none"
              stroke="rgba(255,255,255,0.38)"
              strokeWidth={0.8}
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.32, duration: 0.7 }}
            />
          );
        })}

        {/* Markers — appear after their connecting line */}
        {STOPS.map((stop, i) => {
          const [x, y] = projectPoint(stop.coordinates);

          return (
            <motion.g
              key={`stop-${i}`}
              transform={`translate(${x} ${y})`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.32, duration: 0.4, ease: 'backOut' }}
            >
              {/* Outer pulse ring */}
              <motion.circle
                r={6}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                animate={{ r: [4, 9], opacity: [0.4, 0] }}
                transition={{ delay: 0.5 + i * 0.32, duration: 1.4, repeat: 0 }}
              />
              {/* Core dot */}
              <circle r={3} fill="white" />

              {/* Label */}
              <text
                textAnchor="middle"
                y={-9}
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '7px',
                  fill: 'rgba(255,255,255,0.65)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {stop.label}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </motion.div>
  );
}
