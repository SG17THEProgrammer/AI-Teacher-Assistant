import type { Config } from 'tailwindcss';

/**
 * Design tokens extracted directly from the VedaAI reference PDF:
 * - Warm neutral app background (light warm grey, not pure white)
 * - Near-black ink for primary text and the dark pill CTA
 * - Signature accent: warm orange/vermilion (question highlight, active states)
 * - Success green for correct answers / mapped highlight regions
 * - Warning amber and error red for partial/zero marks
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#141414',
          900: '#0d0d0d',
          800: '#1a1a1a',
          700: '#262626',
          600: '#3d3d3d',
          500: '#5c5c5c',
          400: '#8a8a8a',
          300: '#b3b3b3',
        },
        canvas: {
          DEFAULT: '#e9e7e4',
          50: '#f7f6f4',
          100: '#eeece9',
          200: '#e0ddd8',
        },
        brand: {
          DEFAULT: '#f0603c',
          50: '#fef2ee',
          100: '#fde3d8',
          200: '#fbc8ae',
          300: '#f7a077',
          400: '#f37c50',
          500: '#f0603c',
          600: '#dd4823',
          700: '#b8371a',
          800: '#8f2b16',
          900: '#742615',
        },
        success: {
          DEFAULT: '#2fa84f',
          50: '#eefbf1',
          100: '#d6f5dd',
          200: '#a8e8b8',
          light: '#dff5e3',
          border: '#4cbf6a',
        },
        warning: {
          DEFAULT: '#e0932e',
          50: '#fdf3e4',
          100: '#fbe4c0',
        },
        danger: {
          DEFAULT: '#e0523f',
          50: '#fdece9',
          100: '#fad0c9',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        floating: '0 8px 24px -4px rgb(0 0 0 / 0.12)',
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        sparkle: 'sparkle 1.8s ease-in-out infinite',
        'highlight-in': 'highlight-in 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.04)' },
        },
        sparkle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
          '50%': { opacity: '0.6', transform: 'scale(0.92) rotate(6deg)' },
        },
        'highlight-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
