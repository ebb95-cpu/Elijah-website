'use client';

import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';

const stagger = {
  container: {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.3,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 40 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
    },
  },
};

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 lg:px-12 pt-24 pb-24 overflow-hidden">
      {/* Subtle background noise */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
        }}
      />

      <div className="relative max-w-7xl mx-auto w-full">
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="show"
          className="flex flex-col"
        >
          {/* Headline */}
          <div className="overflow-hidden">
            <motion.p
              variants={stagger.item}
              className="font-display font-light text-brand-text leading-none"
              style={{
                fontSize: 'clamp(4.5rem, 12vw, 11rem)',
                letterSpacing: '-0.02em',
              }}
            >
              Faith
            </motion.p>
          </div>

          <div className="overflow-hidden">
            <motion.p
              variants={stagger.item}
              className="font-display font-light text-muted leading-none pl-4 md:pl-12"
              style={{
                fontSize: 'clamp(3.5rem, 8vw, 7rem)',
                letterSpacing: '-0.01em',
              }}
            >
              +
            </motion.p>
          </div>

          <div className="overflow-hidden">
            <motion.p
              variants={stagger.item}
              className="font-display font-light text-brand-text leading-none"
              style={{
                fontSize: 'clamp(4.5rem, 12vw, 11rem)',
                letterSpacing: '-0.02em',
              }}
            >
              Consistency
            </motion.p>
          </div>

          {/* Tagline */}
          <motion.p
            variants={stagger.item}
            className="font-body font-light text-muted text-base md:text-lg mt-10 max-w-md leading-relaxed"
          >
            Building a life led by faith, grounded in family,
            <br className="hidden md:block" /> and driven by purpose.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={stagger.item}
            className="flex flex-wrap gap-4 mt-10"
          >
            <Button
              variant="primary"
              size="md"
              href="https://yourplaybook.beehiiv.com"
              target="_blank"
            >
              Join the Newsletter
            </Button>
            <Button variant="secondary" size="md" href="#ask-elijah">
              Ask Elijah
            </Button>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-0 right-6 md:right-12 flex flex-col items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <span className="font-body text-[10px] text-dim tracking-[0.3em] uppercase [writing-mode:vertical-rl] rotate-180">
            scroll
          </span>
          <motion.div
            className="w-px h-12 bg-gradient-to-b from-dim to-transparent"
            animate={{ scaleY: [0, 1, 0], originY: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </section>
  );
}
