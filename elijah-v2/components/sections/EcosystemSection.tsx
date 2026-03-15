'use client';

import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';
import { ECOSYSTEM_LANES } from '@/data/ecosystem';

export default function EcosystemSection() {
  return (
    <section className="py-28 px-6 lg:px-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          number="v."
          title="The Ecosystem"
          subtitle="Where to go deeper."
          className="mb-20"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 lg:gap-16">
          {ECOSYSTEM_LANES.map((lane, i) => {
            const isNewsletter = lane.id === 'newsletter';
            return (
              <motion.div
                key={lane.id}
                className={`flex flex-col ${
                  isNewsletter
                    ? 'border border-white/10 p-8 bg-surface'
                    : 'border-t border-white/10 pt-8'
                }`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.7,
                  delay: i * 0.12,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {isNewsletter && (
                  <span className="font-body text-[9px] text-muted tracking-[0.3em] uppercase mb-4 block">
                    Featured
                  </span>
                )}

                <h3
                  className={`font-display font-light leading-none mb-4 ${
                    isNewsletter
                      ? 'text-3xl text-brand-text'
                      : 'text-2xl text-brand-text'
                  }`}
                >
                  {lane.name}
                </h3>

                <p className="font-body text-sm text-muted font-light leading-relaxed mb-8">
                  {lane.description}
                </p>

                <ul className="flex flex-col gap-4 mt-auto">
                  {lane.channels.map((channel) => (
                    <li key={channel.platform}>
                      <a
                        href={channel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col gap-0.5"
                      >
                        <span className="font-body text-[10px] text-dim tracking-widest uppercase">
                          {channel.platform}
                        </span>
                        <span
                          className={`font-body text-sm font-light underline-offset-4 group-hover:underline transition-colors ${
                            isNewsletter
                              ? 'text-brand-text group-hover:text-white'
                              : 'text-muted group-hover:text-brand-text'
                          }`}
                        >
                          {channel.handle}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>

                {isNewsletter && (
                  <a
                    href="https://yourplaybook.beehiiv.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-8 w-full py-3 text-center font-body text-xs text-bg bg-brand-text hover:bg-white transition-colors tracking-widest uppercase"
                  >
                    Subscribe Free
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
