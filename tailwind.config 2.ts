import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'agesci-blue': '#002B49',
        'agesci-blue-light': '#0B3B60',
        'scout-gold': '#FFB81C',
        'branch-eg': '#2E7D32',
        'surface-bg': '#F8FAFC',
        'surface-card': '#FFFFFF',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-outfit)', 'var(--font-inter)', 'sans-serif'],
      },
      boxShadow: {
        'card-sm': '0 1px 3px 0 rgba(0, 43, 73, 0.05), 0 1px 2px -1px rgba(0, 43, 73, 0.05)',
        'card-md': '0 4px 6px -1px rgba(0, 43, 73, 0.08), 0 2px 4px -2px rgba(0, 43, 73, 0.05)',
      }
    },
  },
  plugins: [],
}

export default config
