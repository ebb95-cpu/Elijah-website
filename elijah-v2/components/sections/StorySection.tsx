'use client';

import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';
import { JOURNEY_STOPS } from '@/data/journey';

export default function StorySection() {
  return (
    <section id="journey" className="py-28 px-6 lg:px-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <SectionHeader number="iii." title="The Journey" className="mb-12" />

        {/* Narrative intro */}
        <motion.p
          className="font-display text-xl md:text-2xl font-light italic text-muted max-w-2xl mb-20 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          From the courts of Atlanta to championships in Milwaukee. From Provo
          to Istanbul. The journey didn&apos;t follow a script. It followed faith.
        </motion.p>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-0 md:left-8 top-0 bottom-0 w-px bg-white/5" />

          <div className="flex flex-col gap-0">
            {JOURNEY_STOPS.map((stop, i) => {
              const isLast = i === JOURNEY_STOPS.length - 1;
              return (
                <motion.div
                  key={stop.id}
                  className="relative pl-8 md:pl-24 pb-16 last:pb-0"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.7,
                    delay: i * 0.07,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {/* Dot on line */}
                  <div className="absolute left-[-4px] md:left-[28px] top-2 w-[9px] h-[9px] rounded-full border border-white/20 bg-bg" />

                  {/* Number */}
                  <span className="font-body text-[10px] text-dim tracking-[0.25em] uppercase block mb-2">
                    {String(stop.id).padStart(2, '0')}
                  </span>

                  {/* City + Country */}
                  <div className="flex items-baseline gap-3 flex-wrap mb-1">
                    <h3
                      className="font-display font-light text-brand-text leading-none"
                      style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
                    >
                      {stop.city}
                    </h3>
                    <span className="font-body text-xs text-dim tracking-widest uppercase">
                      {stop.country}
                    </span>
                  </div>

                  {/* Team */}
                  {stop.team && (
                    <p className="font-body text-xs text-muted tracking-widest uppercase mb-3">
                      {stop.team}
                      {stop.year ? ` · ${stop.year}` : ''}
                    </p>
                  )}

                  {/* Description */}
                  <p className="font-body text-sm text-muted font-light leading-relaxed max-w-lg">
                    {stop.description}
                  </p>

                  {/* "To be continued" on last stop */}
                  {isLast && (
                    <p className="font-display text-lg italic text-dim mt-4">
                      — to be continued.
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-20 pt-12 border-t border-white/5"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-body text-xs text-dim tracking-widest uppercase">
            The full story
          </p>
          <p className="font-display text-2xl md:text-3xl font-light text-muted mt-2">
            Learn the story behind the journey{' '}
            <span className="text-dim">→</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
