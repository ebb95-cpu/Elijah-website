'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_LINKS = [
  { label: 'Journey', href: '#journey' },
  { label: 'Newsletter', href: 'https://yourplaybook.beehiiv.com', external: true },
  { label: 'Things I Use', href: '/things-i-use' },
  { label: 'Ask Elijah', href: '#ask-elijah' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
          scrolled
            ? 'bg-bg/80 backdrop-blur-md border-b border-white/5'
            : 'bg-transparent'
        }`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group">
            <span className="font-display text-xl font-light text-brand-text tracking-[0.3em] uppercase group-hover:tracking-[0.4em] transition-all duration-500">
              E&nbsp;&nbsp;B
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-xs text-muted hover:text-brand-text tracking-widest uppercase transition-colors duration-200"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="font-body text-xs text-muted hover:text-brand-text tracking-widest uppercase transition-colors duration-200"
                >
                  {link.label}
                </Link>
              )
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2 group"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span
              className={`block w-6 h-px bg-brand-text transition-all duration-300 ${
                menuOpen ? 'rotate-45 translate-y-[5px]' : ''
              }`}
            />
            <span
              className={`block w-6 h-px bg-brand-text transition-all duration-300 ${
                menuOpen ? 'opacity-0 -translate-x-2' : ''
              }`}
            />
            <span
              className={`block w-6 h-px bg-brand-text transition-all duration-300 ${
                menuOpen ? '-rotate-45 -translate-y-[5px]' : ''
              }`}
            />
          </button>
        </div>
      </motion.nav>

      {/* Mobile full-screen menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center gap-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              className="absolute top-6 right-6 p-2"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <span className="block w-6 h-px bg-brand-text rotate-45 translate-y-px" />
              <span className="block w-6 h-px bg-brand-text -rotate-45 -translate-y-px" />
            </button>

            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="font-display text-3xl font-light text-brand-text tracking-[0.3em] uppercase mb-8"
            >
              E&nbsp;&nbsp;B
            </Link>

            {NAV_LINKS.map((link, i) => (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.4 }}
              >
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="font-display text-4xl font-light text-brand-text tracking-wide hover:text-muted transition-colors"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="font-display text-4xl font-light text-brand-text tracking-wide hover:text-muted transition-colors"
                  >
                    {link.label}
                  </Link>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
