'use client';

import { motion } from 'framer-motion';

interface SectionHeaderProps {
  number: string;
  title: string;
  subtitle?: string;
  className?: string;
  centered?: boolean;
}

export default function SectionHeader({
  number,
  title,
  subtitle,
  className = '',
  centered = false,
}: SectionHeaderProps) {
  return (
    <div className={`${centered ? 'text-center' : ''} ${className}`}>
      <motion.p
        className="font-body text-xs text-muted tracking-[0.25em] uppercase mb-3"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {number}
      </motion.p>
      <motion.h2
        className="font-display text-5xl md:text-6xl lg:text-7xl font-light text-brand-text leading-none"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          className="font-body text-base text-muted font-light mt-4 max-w-lg"
          style={centered ? { marginLeft: 'auto', marginRight: 'auto' } : {}}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
