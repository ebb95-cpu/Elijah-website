'use client';

import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';

const PILLARS = [
  {
    numeral: 'I',
    name: 'Faith',
    description:
      "Trusting God's plan through success, setbacks, uncertainty, and growth. Faith isn't passive — it's the foundation every decision is built on.",
  },
  {
    numeral: 'II',
    name: 'Family',
    description:
      'Being a husband and father first. Building life around what matters most. The career is a platform; family is the purpose.',
  },
  {
    numeral: 'III',
    name: 'Purpose',
    description:
      'Using basketball, discipline, and platform to serve, teach, and build. Every rep, every game, every word — it has to mean something.',
  },
];

export default function FoundationSection() {
  return (
    <section className="py-28 px-6 lg:px-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          number="ii."
          title="The Foundation"
          className="mb-20"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-px border border-white/5">
          {PILLARS.map((pillar, i) => (
            <motion.div
              key={pillar.name}
              className="p-10 md:p-12 border-t border-white/5 md:border-t-0 first:border-t-0"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.8,
                delay: i * 0.15,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {/* Large numeral */}
              <p
                className="font-display font-light text-dim leading-none mb-8 select-none"
                style={{ fontSize: 'clamp(4rem, 6vw, 6rem)' }}
                aria-hidden="true"
              >
                {pillar.numeral}
              </p>

              {/* Top rule */}
              <div className="w-8 h-px bg-brand-text/30 mb-6" />

              {/* Pillar name */}
              <h3 className="font-display text-3xl md:text-4xl font-light text-brand-text mb-5 tracking-wide">
                {pillar.name}
              </h3>

              {/* Description */}
              <p className="font-body text-sm text-muted font-light leading-relaxed">
                {pillar.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
