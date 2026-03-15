'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';
import Button from '@/components/ui/Button';
import { METRICS } from '@/data/mapData';

const CHAT_MESSAGES = [
  {
    type: 'user' as const,
    text: "How do you stay consistent when you're not motivated?",
  },
  {
    type: 'elijah' as const,
    text: "Motivation comes and goes — that's the truth nobody wants to hear. Consistency is the system you build for when it doesn't show up. I go back to my foundation: faith first, then the work. The feeling follows the action, not the other way around.",
  },
  {
    type: 'user' as const,
    text: 'What did winning the NBA championship teach you about faith?',
  },
  {
    type: 'elijah' as const,
    text: "It confirmed everything. The years I spent grinding in Israel, in Provo, in empty gyms — they weren't wasted. They were preparation. Faith isn't hoping things work out. It's trusting the process even when you can't see the destination.",
  },
];

function ChatBubble({
  message,
  index,
}: {
  message: (typeof CHAT_MESSAGES)[number];
  index: number;
}) {
  const isElijah = message.type === 'elijah';
  return (
    <motion.div
      className={`flex gap-3 ${isElijah ? 'flex-row' : 'flex-row-reverse'}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {isElijah && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface2 border border-white/10 flex items-center justify-center">
          <span className="font-body text-[9px] font-medium text-muted tracking-wider">
            EB
          </span>
        </div>
      )}
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl ${
          isElijah
            ? 'bg-surface2 border border-white/5 rounded-tl-sm text-brand-text'
            : 'bg-surface border border-white/5 rounded-tr-sm text-muted'
        }`}
      >
        <p className="font-body text-sm font-light leading-relaxed">
          {message.text}
        </p>
      </div>
    </motion.div>
  );
}

export default function AskElijahSection() {
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
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
        body: JSON.stringify({ email: email.trim(), source: 'ask-elijah' }),
      });
      const data = (await res.json()) as { success: boolean; message: string };
      if (data.success) {
        setStatus('success');
        setMessage("You're on the list. We'll be in touch.");
        setEmail('');
        setQuestion('');
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
    <section
      id="ask-elijah"
      className="py-28 px-6 lg:px-12 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left: Header + description */}
          <div>
            <SectionHeader
              number="iv."
              title="Ask Elijah"
              subtitle="An AI-powered mentorship experience built on Elijah's philosophy, experiences, and teachings."
              className="mb-8"
            />

            <motion.p
              className="font-body text-sm text-muted font-light leading-relaxed mb-10"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              Soon you&apos;ll be able to ask Elijah anything — about basketball,
              discipline, mindset, faith, fatherhood, or life as a professional
              athlete. The answers will be built from years of lived experience.
            </motion.p>

            {/* Waitlist form */}
            <motion.form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
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
                className="w-full px-4 py-3 bg-surface border border-white/8 text-brand-text placeholder-muted/50 font-body text-sm font-light focus:outline-none focus:border-white/20 transition-colors"
              />
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What would you ask Elijah?"
                rows={3}
                className="w-full px-4 py-3 bg-surface border border-white/8 text-brand-text placeholder-muted/50 font-body text-sm font-light focus:outline-none focus:border-white/20 transition-colors resize-none"
              />

              {status === 'idle' || status === 'loading' ? (
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={status === 'loading'}
                  className="w-full"
                >
                  {status === 'loading' ? 'Joining...' : 'Join the Waitlist'}
                </Button>
              ) : status === 'success' ? (
                <p className="font-body text-sm text-brand-text/80 py-3 text-center tracking-wide">
                  {message}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="font-body text-xs text-red-400/80">{message}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => setStatus('idle')}
                  >
                    Try Again
                  </Button>
                </div>
              )}

              <p className="font-body text-xs text-dim text-center">
                {METRICS.questionsAnswered}+ people on the waitlist
              </p>
            </motion.form>
          </div>

          {/* Right: Chat preview */}
          <motion.div
            className="bg-surface border border-white/6 rounded-2xl p-6 flex flex-col gap-5"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="w-9 h-9 rounded-full bg-surface2 border border-white/10 flex items-center justify-center">
                <span className="font-body text-[10px] font-medium text-muted tracking-wider">
                  EB
                </span>
              </div>
              <div>
                <p className="font-body text-sm text-brand-text font-medium">
                  Elijah Bryant
                </p>
                <p className="font-body text-[10px] text-muted tracking-widest uppercase">
                  Ask anything
                </p>
              </div>
              <div className="ml-auto flex gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500/60" />
                <span className="font-body text-[10px] text-dim">Coming soon</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex flex-col gap-4">
              {CHAT_MESSAGES.map((msg, i) => (
                <ChatBubble key={i} message={msg} index={i} />
              ))}
            </div>

            {/* Input preview */}
            <div className="pt-4 border-t border-white/5">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-surface2 border border-white/6 rounded-xl opacity-40">
                <span className="font-body text-xs text-dim flex-1">
                  Ask your question...
                </span>
                <div className="w-5 h-5 rounded-full bg-dim/50 flex items-center justify-center">
                  <span className="text-[8px] text-muted">↑</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
