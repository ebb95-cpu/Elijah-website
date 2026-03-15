'use client';

import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';
import ProductCard from '@/components/ProductCard';
import Button from '@/components/ui/Button';
import { PRODUCTS } from '@/data/products';

const FEATURED_PRODUCTS = PRODUCTS.filter((p) => p.featured).slice(0, 3);

export default function ThingsIUsePreview() {
  return (
    <section className="py-28 px-6 lg:px-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <SectionHeader number="vi." title="Things I Use" />
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <Button variant="secondary" size="sm" href="/things-i-use">
              View All
            </Button>
          </motion.div>
        </div>

        <motion.p
          className="font-body text-sm text-muted font-light leading-relaxed max-w-2xl mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Over the years people have asked what gear, tools, and products I
          actually use. These are things I&apos;ve personally tested — from training
          and recovery to everyday essentials.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURED_PRODUCTS.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.7,
                delay: i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
