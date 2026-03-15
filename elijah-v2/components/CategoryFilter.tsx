'use client';

import { motion } from 'framer-motion';

interface CategoryFilterProps {
  categories: string[];
  selected: string;
  onChange: (cat: string) => void;
}

export default function CategoryFilter({
  categories,
  selected,
  onChange,
}: CategoryFilterProps) {
  const allCategories = ['All', ...categories];

  return (
    <div className="flex flex-wrap gap-2">
      {allCategories.map((cat) => {
        const isActive = selected === cat;
        return (
          <motion.button
            key={cat}
            onClick={() => onChange(cat)}
            className={`px-4 py-2 font-body text-xs tracking-widest uppercase transition-all duration-200 border ${
              isActive
                ? 'bg-brand-text text-bg border-brand-text'
                : 'bg-transparent text-muted border-white/10 hover:border-white/25 hover:text-brand-text'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {cat}
          </motion.button>
        );
      })}
    </div>
  );
}
