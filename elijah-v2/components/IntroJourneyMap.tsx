'use client';

import { motion } from 'framer-motion';
import { ComposableMap, Geographies, Geography, Marker, Line } from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

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

export default function IntroJourneyMap() {
  return (
    <motion.div
      className="w-full h-full flex items-center justify-center bg-black overflow-hidden"
      initial={{ scale: 1.06 }}
      animate={{ scale: 1 }}
      transition={{ duration: 6, ease: [0.16, 1, 0.3, 1] }}
    >
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 148, center: [-30, 38] }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Base map — extremely subtle */}
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#141414"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={0.4}
                style={{
                  default: { outline: 'none' },
                  hover:   { outline: 'none' },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        {/* Connection lines — staggered reveal */}
        {STOPS.slice(0, -1).map((stop, i) => (
          <motion.g
            key={`line-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.32, duration: 0.7 }}
          >
            <Line
              from={stop.coordinates}
              to={STOPS[i + 1].coordinates}
              stroke="rgba(255,255,255,0.38)"
              strokeWidth={0.8}
              strokeLinecap="round"
            />
          </motion.g>
        ))}

        {/* Markers — appear after their connecting line */}
        {STOPS.map((stop, i) => (
          <Marker key={`stop-${i}`} coordinates={stop.coordinates}>
            <motion.g
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
          </Marker>
        ))}
      </ComposableMap>
    </motion.div>
  );
}
