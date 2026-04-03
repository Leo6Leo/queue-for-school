import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        queue: {
          ink: '#1e293b',
          panel: '#ffffff',
          border: 'rgba(0, 0, 0, 0.08)',
          marking: '#6366f1',
          question: '#10b981',
        },
      },
      boxShadow: {
        glow: '0 14px 40px rgba(15, 23, 42, 0.14)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
} satisfies Config
