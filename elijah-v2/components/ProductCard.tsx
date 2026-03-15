'use client';

import { motion } from 'framer-motion';
import { Product } from '@/types';

interface ProductCardProps {
  product: Product;
}

const CATEGORY_COLORS: Record<Product['category'], string> = {
  Training: 'text-blue-400/70',
  Recovery: 'text-purple-400/70',
  Everyday: 'text-green-400/70',
  Tech: 'text-orange-400/70',
  Family: 'text-rose-400/70',
  Travel: 'text-amber-400/70',
};

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <motion.article
      className="flex flex-col border border-white/5 bg-surface hover:bg-surface2 transition-colors duration-300 group"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Image area */}
      <div className="aspect-[4/3] bg-surface2 relative overflow-hidden">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-5xl font-light text-dim/50">
              {product.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
          {product.badge && (
            <span className="font-body text-[9px] px-2.5 py-1 bg-bg/90 text-muted tracking-widest uppercase border border-white/5">
              {product.badge}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-6">
        {/* Category */}
        <p
          className={`font-body text-[9px] tracking-widest uppercase mb-3 ${
            CATEGORY_COLORS[product.category]
          }`}
        >
          {product.category}
        </p>

        {/* Name */}
        <h3 className="font-display text-2xl font-light text-brand-text leading-tight mb-3">
          {product.name}
        </h3>

        {/* Short description */}
        <p className="font-body text-sm text-muted font-light leading-relaxed mb-5">
          {product.shortDescription}
        </p>

        {/* Why I use it */}
        <div className="border-l-2 border-white/8 pl-4 mb-6 flex-1">
          <p className="font-body text-[10px] text-dim tracking-widest uppercase mb-2">
            Why I use it
          </p>
          <p className="font-body text-sm text-muted font-light italic leading-relaxed">
            &ldquo;{product.whyIUseIt}&rdquo;
          </p>
        </div>

        {/* CTA */}
        <a
          href={product.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="w-full py-3 text-center font-body text-xs text-muted border border-white/8 tracking-widest uppercase hover:text-brand-text hover:border-white/20 transition-colors duration-200"
        >
          View Product →
        </a>
      </div>
    </motion.article>
  );
}
