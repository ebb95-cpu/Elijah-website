'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ProductCard from '@/components/ProductCard';
import CategoryFilter from '@/components/CategoryFilter';
import Footer from '@/components/layout/Footer';
import { PRODUCTS } from '@/data/products';
import { Product } from '@/types';

const ALL_CATEGORIES = Array.from(
  new Set(PRODUCTS.map((p) => p.category))
) as Product['category'][];

export default function ThingsIUsePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const filteredProducts =
    selectedCategory === 'All'
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === selectedCategory);

  const sortedProducts = [...filteredProducts].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-20 px-6 lg:px-12 border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <motion.p
            className="font-body text-[10px] text-muted tracking-[0.3em] uppercase mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            Curated by Elijah Bryant
          </motion.p>

          <motion.h1
            className="font-display font-light text-brand-text leading-none mb-6"
            style={{ fontSize: 'clamp(3.5rem, 10vw, 9rem)', letterSpacing: '-0.02em' }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            Things I Use
          </motion.h1>

          <motion.p
            className="font-body text-base text-muted font-light leading-relaxed max-w-xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            A curated collection of products, tools, and essentials I actually
            use and believe in. No fluff — only things I&apos;ve tested personally.
          </motion.p>
        </div>
      </section>

      {/* Disclosure */}
      <section className="py-6 px-6 lg:px-12 bg-surface">
        <div className="max-w-7xl mx-auto">
          <p className="font-body text-xs text-dim leading-relaxed max-w-3xl">
            <span className="text-muted">Disclosure:</span> Some links on this
            page are affiliate links — I may earn a small commission if you
            purchase through them. It costs you nothing extra, and I only
            recommend things I genuinely use in my own life.
          </p>
        </div>
      </section>

      {/* Filter + Grid */}
      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Filter */}
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <CategoryFilter
              categories={ALL_CATEGORIES}
              selected={selectedCategory}
              onChange={setSelectedCategory}
            />
          </motion.div>

          {/* Count */}
          <p className="font-body text-xs text-dim tracking-widest uppercase mb-8">
            {sortedProducts.length} item{sortedProducts.length !== 1 ? 's' : ''}
            {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
          </p>

          {/* Grid */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            layout
          >
            {sortedProducts.map((product, i) => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.07,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>

          {sortedProducts.length === 0 && (
            <div className="py-24 text-center">
              <p className="font-display text-3xl font-light text-muted">
                Nothing here yet.
              </p>
              <p className="font-body text-sm text-dim mt-2">
                More products coming soon.
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </>
  );
}
