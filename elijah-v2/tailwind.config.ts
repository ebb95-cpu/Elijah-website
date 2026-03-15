import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#090909',
        surface: '#131313',
        surface2: '#1c1c1c',
        'brand-border': 'rgba(255, 255, 255, 0.07)',
        'brand-text': '#f0ede8',
        muted: '#888880',
        dim: '#444440',
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Georgia', 'serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'draw-line': {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        pulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.8s ease forwards',
        'slide-up': 'slide-up 0.8s ease forwards',
        'draw-line': 'draw-line 2s ease forwards',
        'pulse-dot': 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
