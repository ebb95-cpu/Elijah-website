'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';
import { METRICS } from '@/data/mapData';

const WorldMap = dynamic(() => import('@/components/WorldMap'), { ssr: false });

const METRIC_CARDS = [
  { value: `${(METRICS.subscribers / 1000).toFixed(1)}K+`, label: 'Subscribers' },
  { value: `${METRICS.countries}`, label: 'Countries' },
  { value: `${METRICS.questionsAnswered}+`, label: 'Questions Answered' },
  { value: `${(METRICS.communityMembers / 1000).toFixed(1)}K+`, label: 'Community Members' },
];

function MetricCard({
  value,
  label,
  index,
}: {
  value: string;
  label: string;
  index: number;
}) {
  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.7,
        delay: index * 0.1,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <p className="font-display text-4xl md:text-5xl font-light text-brand-text leading-none">
        {value}
      </p>
      <p className="font-body text-xs text-muted tracking-widest uppercase mt-2">
        {label}
      </p>
    </motion.div>
  );
}

export default function MovementSection() {
  return (
    <section className="py-28 px-6 lg:px-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          number="i."
          title="A Global Movement"
          subtitle="Faith + Consistency, around the world."
          className="mb-20"
        />

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-20">
          {METRIC_CARDS.map((card, i) => (
            <MetricCard key={card.label} {...card} index={i} />
          ))}
        </div>

        {/* Map */}
        <motion.div
          className="w-full rounded-sm overflow-hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <WorldMap />
        </motion.div>

        {/* Caption */}
        <motion.p
          className="font-display text-xl md:text-2xl font-light italic text-muted text-center mt-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          Every dot is a step. Every step has purpose.
        </motion.p>
      </div>
    </section>
  );
}
