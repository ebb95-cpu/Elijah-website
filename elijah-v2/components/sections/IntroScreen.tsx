'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const IntroJourneyMap = dynamic(() => import('@/components/IntroJourneyMap'), { ssr: false });

type Phase = 'dots' | 'journey' | 'message1' | 'message2' | 'brand' | 'exit';

interface IntroScreenProps {
  onComplete?: () => void;
}

const STORAGE_KEY = 'eb_intro_seen';

// SVG coordinate system
const SVG_W = 320;
const SVG_H = 80;
const DOT_Y = 40;
const DOT_X = [52, 160, 268] as const; // left, center, right
const DRAG_START = DOT_X[0];
const DRAG_END   = DOT_X[2];
const DRAG_RANGE = DRAG_END - DRAG_START; // 216

export default function IntroScreen({ onComplete }: IntroScreenProps) {
  const [visible, setVisible]           = useState(false);
  const [phase, setPhase]               = useState<Phase>('dots');
  const [hintVisible, setHintVisible]   = useState(false);
  const [isDragging, setIsDragging]     = useState(false);
  const [isSnapping, setIsSnapping]     = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const rawProgress = useRef(0);
  const svgRef      = useRef<SVGSVGElement>(null);
  const phaseRef    = useRef<Phase>('dots');
  phaseRef.current  = phase;

  // Show or skip on mount
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        onComplete?.();
        return;
      }
    } catch { /* ignore */ }
    setVisible(true);
    const t = setTimeout(() => setHintVisible(true), 1600);
    return () => clearTimeout(t);
  }, [onComplete]);

  // Phase auto-progression
  useEffect(() => {
    if (!visible) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    if (phase === 'journey') {
      timeouts.push(setTimeout(() => setPhase('message1'), 5000));
    }
    if (phase === 'message1') {
      timeouts.push(setTimeout(() => setPhase('message2'), 2800));
    }
    if (phase === 'message2') {
      timeouts.push(setTimeout(() => setPhase('brand'), 2800));
    }
    if (phase === 'brand') {
      timeouts.push(setTimeout(() => setPhase('exit'), 2800));
    }
    if (phase === 'exit') {
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
      timeouts.push(setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1200));
    }
    return () => timeouts.forEach(clearTimeout);
  }, [phase, visible, onComplete]);

  // ─── Pointer helpers ──────────────────────────────────────────────────────
  const getSvgProgress = useCallback((clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect   = svg.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const svgX   = (clientX - rect.left) * scaleX;
    return Math.max(0, Math.min(1, (svgX - DRAG_START) / DRAG_RANGE));
  }, []);

  const isNearFirstDot = useCallback((clientX: number, clientY: number): boolean => {
    const svg = svgRef.current;
    if (!svg) return false;
    const rect   = svg.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const scaleY = SVG_H / rect.height;
    const dotSvgX = DRAG_START;
    const dotSvgY = DOT_Y;
    const dotScreenX = rect.left + dotSvgX / scaleX;
    const dotScreenY = rect.top  + dotSvgY / scaleY;
    return Math.hypot(clientX - dotScreenX, clientY - dotScreenY) < 52;
  }, []);

  const triggerComplete = useCallback(() => {
    rawProgress.current = 1;
    setRenderProgress(1);
    setTimeout(() => setPhase('journey'), 500);
  }, []);

  const snapBack = useCallback(() => {
    setIsSnapping(true);
    rawProgress.current = 0;
    setRenderProgress(0);
    setTimeout(() => setIsSnapping(false), 380);
  }, []);

  // ─── SVG pointer events ───────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (phaseRef.current !== 'dots') return;
      if (!isNearFirstDot(e.clientX, e.clientY)) return;
      setIsDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [isNearFirstDot],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDragging || phaseRef.current !== 'dots') return;
      const p = getSvgProgress(e.clientX);
      rawProgress.current = p;
      setRenderProgress(p);
      if (p >= 0.96) {
        setIsDragging(false);
        triggerComplete();
      }
    },
    [isDragging, getSvgProgress, triggerComplete],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (rawProgress.current < 0.96) snapBack();
  }, [isDragging, snapBack]);

  // ─── Derived values ───────────────────────────────────────────────────────
  const activeLineEnd = DRAG_START + renderProgress * DRAG_RANGE;
  const dotActives    = [renderProgress > 0.02, renderProgress >= 0.45, renderProgress >= 0.93];

  if (!visible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden"
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
    >

      {/* ── DOTS PHASE ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'dots' && (
          <motion.div
            key="dots-phase"
            className="flex flex-col items-center gap-14 px-6 w-full"
            style={{ maxWidth: 480 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.5 } }}
            transition={{ duration: 0.9 }}
          >
            {/* Name */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: -18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: 'clamp(2rem, 7vw, 3.6rem)',
                  fontWeight: 300,
                  letterSpacing: '0.22em',
                  color: 'white',
                }}
              >
                Elijah Bryant
              </p>
            </motion.div>

            {/* Slider */}
            <motion.div
              className="flex flex-col items-center gap-6 w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.75, duration: 0.8 }}
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="touch-none select-none w-full"
                style={{
                  maxWidth: 320,
                  overflow: 'visible',
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* Background track */}
                <line
                  x1={DOT_X[0]} y1={DOT_Y}
                  x2={DOT_X[2]} y2={DOT_Y}
                  stroke="rgba(255,255,255,0.13)"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                />

                {/* Active line — snaps back with CSS transition */}
                <line
                  x1={DOT_X[0]} y1={DOT_Y}
                  x2={activeLineEnd} y2={DOT_Y}
                  stroke="white"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  style={{
                    transition: isSnapping ? 'x2 0.38s cubic-bezier(0.4,0,0.2,1)' : 'none',
                  }}
                />

                {/* Dots */}
                {DOT_X.map((x, i) => {
                  const active = dotActives[i];
                  return (
                    <g key={i}>
                      {/* Soft glow when active */}
                      <circle
                        cx={x} cy={DOT_Y}
                        r={active ? 16 : 0}
                        fill="none"
                        stroke="rgba(255,255,255,0.07)"
                        strokeWidth={1}
                        style={{ transition: 'r 0.25s ease' }}
                      />
                      {/* Core dot */}
                      <circle
                        cx={x} cy={DOT_Y}
                        r={active ? 7.5 : 5.5}
                        fill={active ? 'white' : 'black'}
                        stroke="white"
                        strokeWidth={1.5}
                        style={{ transition: 'r 0.22s ease, fill 0.22s ease' }}
                      />
                    </g>
                  );
                })}

                {/* Animated arrow hint — pulses right of last dot */}
                {renderProgress < 0.05 && (
                  <motion.text
                    x={DOT_X[2] + 20} y={DOT_Y + 4.5}
                    fill="rgba(255,255,255,0.25)"
                    fontSize={12}
                    fontFamily="Inter, sans-serif"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ delay: 2.5, duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                  >
                    →
                  </motion.text>
                )}
              </svg>

              {/* Hint text */}
              <AnimatePresence>
                {hintVisible && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9 }}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: '0.66rem',
                      letterSpacing: '0.3em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.3)',
                      textAlign: 'center',
                    }}
                  >
                    Connect the dots to start your journey.
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── JOURNEY MAP PHASE ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'journey' && (
          <motion.div
            key="journey-phase"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          >
            <IntroJourneyMap />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MESSAGES + BRAND PHASES ───────────────────────────────────────── */}
      <AnimatePresence>
        {(phase === 'message1' || phase === 'message2' || phase === 'brand') && (
          <motion.div
            key="overlay"
            className="absolute inset-0 bg-black flex items-center justify-center px-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          >
            <AnimatePresence mode="wait">

              {phase === 'message1' && (
                <motion.p
                  key="m1"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    fontSize: 'clamp(1.4rem, 4.5vw, 2.6rem)',
                    fontWeight: 300,
                    color: 'white',
                    letterSpacing: '0.01em',
                    lineHeight: 1.25,
                    textAlign: 'center',
                  }}
                >
                  Everyone's journey is different.
                </motion.p>
              )}

              {phase === 'message2' && (
                <motion.p
                  key="m2"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    fontSize: 'clamp(1.4rem, 4.5vw, 2.6rem)',
                    fontWeight: 300,
                    color: 'white',
                    letterSpacing: '0.01em',
                    lineHeight: 1.25,
                    textAlign: 'center',
                  }}
                >
                  So stop comparing yours to others.
                </motion.p>
              )}

              {phase === 'brand' && (
                <motion.div
                  key="brand"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center gap-6 text-center"
                >
                  {/* Three-dot motif */}
                  <div className="flex items-center gap-3">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-white"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.14, duration: 0.4, ease: 'backOut' }}
                      />
                    ))}
                  </div>

                  {/* Faith + Consistency */}
                  <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.42, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      fontFamily: 'var(--font-cormorant)',
                      fontSize: 'clamp(2.8rem, 10vw, 6.5rem)',
                      fontWeight: 300,
                      color: 'white',
                      letterSpacing: '0.08em',
                      lineHeight: 1,
                    }}
                  >
                    Faith{' '}
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>+</span>
                    {' '}Consistency
                  </motion.p>

                  {/* Tagline */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.95, duration: 0.9 }}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: '0.68rem',
                      letterSpacing: '0.34em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.32)',
                    }}
                  >
                    faith · family · purpose
                  </motion.p>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
