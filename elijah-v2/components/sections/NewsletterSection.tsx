'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { METRICS } from '@/data/mapData';

export default function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'homepage-newsletter' }),
      });
      const data = (await res.json()) as { success: boolean; message: string };
      if (data.success) {
        setStatus('success');
        setMessage('Welcome to the movement.');
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.message);
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  }

  return (
    <section className="py-28 px-6 lg:px-12 border-t border-white/5 bg-surface">
      <div className="max-w-4xl mx-auto text-center">
        <motion.p
          className="font-body text-[10px] text-muted tracking-[0.35em] uppercase mb-6"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          Your Playbook · Newsletter
        </motion.p>

        <motion.h2
          className="font-display font-light text-brand-text leading-none mb-6"
          style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          Join the Movement.
        </motion.h2>

        <motion.p
          className="font-body text-base text-muted font-light leading-relaxed max-w-xl mx-auto mb-4"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          The Faith + Consistency newsletter — lessons on faith, discipline,
          family, purpose, and the journey on and off the court.
        </motion.p>

        <motion.p
          className="font-body text-xs text-dim tracking-widest uppercase mb-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {METRICS.subscribers.toLocaleString()}+ subscribers across {METRICS.countries} countries
        </motion.p>

        {status === 'success' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-8"
          >
            <p className="font-display text-3xl font-light text-brand-text">
              {message}
            </p>
            <p className="font-body text-sm text-muted mt-2">
              Check your inbox for a welcome letter.
            </p>
          </motion.div>
        ) : (
          <motion.form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-4 py-3 bg-bg border border-white/10 text-brand-text placeholder-muted/40 font-body text-sm font-light focus:outline-none focus:border-white/25 transition-colors"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-6 py-3 bg-brand-text text-bg font-body text-xs tracking-widest uppercase hover:bg-white transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {status === 'loading' ? 'Joining...' : 'Subscribe'}
            </button>
          </motion.form>
        )}

        {status === 'error' && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-body text-xs text-red-400/70 mt-4"
          >
            {message}
          </motion.p>
        )}
      </div>
    </section>
  );
}
