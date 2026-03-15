'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  target?: string;
  rel?: string;
}

const sizeClasses = {
  sm: 'px-4 py-2 text-xs tracking-widest',
  md: 'px-6 py-3 text-sm tracking-widest',
  lg: 'px-8 py-4 text-sm tracking-widest',
};

const variantClasses = {
  primary:
    'bg-brand-text text-bg hover:bg-white border border-brand-text font-medium',
  secondary:
    'bg-transparent text-brand-text border border-brand-text/40 hover:border-brand-text hover:bg-brand-text hover:text-bg font-medium',
  ghost:
    'bg-transparent text-muted hover:text-brand-text border border-transparent underline-offset-4 hover:underline font-light',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  children,
  className = '',
  type = 'button',
  disabled = false,
  target,
  rel,
}: ButtonProps) {
  const baseClasses = `
    inline-flex items-center justify-center
    uppercase tracking-widest
    transition-all duration-200 ease-out
    font-body
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
    ${className}
  `.trim();

  if (href) {
    const isExternal = href.startsWith('http') || href.startsWith('//');
    if (isExternal || target === '_blank') {
      return (
        <motion.a
          href={href}
          target={target ?? '_blank'}
          rel={rel ?? 'noopener noreferrer'}
          className={baseClasses}
          whileTap={{ scale: 0.97 }}
        >
          {children}
        </motion.a>
      );
    }
    return (
      <motion.div whileTap={{ scale: 0.97 }}>
        <Link href={href} className={baseClasses}>
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
    >
      {children}
    </motion.button>
  );
}
