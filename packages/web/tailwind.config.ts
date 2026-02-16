import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Legacy primary colors (for backwards compatibility)
        primary: {
          50: '#fef1f7',
          100: '#fee5f0',
          200: '#fecce3',
          300: '#ffa2cb',
          400: '#fe68a7',
          500: '#f83b85',
          600: '#e91f63',
          700: '#ca0f47',
          800: '#a7103b',
          900: '#8b1335',
          950: '#55031a',
        },
        // Semantic theme colors (CSS variable based)
        background: 'var(--color-background)',
        'background-alt': 'var(--color-background-alt)',
        surface: 'var(--color-surface)',
        'surface-hover': 'var(--color-surface-hover)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'text-inverse': 'var(--color-text-inverse)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-muted': 'var(--color-accent-muted)',
        interactive: 'var(--color-interactive)',
        'interactive-hover': 'var(--color-interactive-hover)',
        border: 'var(--color-border)',
        'border-hover': 'var(--color-border-hover)',
        'border-focus': 'var(--color-border-focus)',
        success: 'var(--color-success)',
        'success-muted': 'var(--color-success-muted)',
        warning: 'var(--color-warning)',
        'warning-muted': 'var(--color-warning-muted)',
        error: 'var(--color-error)',
        'error-muted': 'var(--color-error-muted)',
        info: 'var(--color-info)',
        'info-muted': 'var(--color-info-muted)',
      },
      backgroundColor: {
        overlay: 'var(--color-overlay)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
