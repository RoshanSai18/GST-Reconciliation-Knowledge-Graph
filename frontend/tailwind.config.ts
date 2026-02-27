import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutrals
        bg:         '#f5f5f5',  // page background
        surface:    '#ffffff',  // card / panel background
        'surface-2':'#fafafa',  // secondary inset panels
        border:     '#d4d4d4',  // all borders
        foreground: '#0a0a0a',  // primary text
        ink:        '#262626',  // secondary dark text
        muted:      '#525252',  // muted / help text
        subtle:     '#737373',  // even softer
        // Accent
        accent:     '#64748b',  // slate-500: buttons, active states
        // Semantic
        success:    '#4ade80',  // green-400
        emerald:    '#34d399',  // emerald-400
        warning:    '#fb923c',  // orange-400
        amber:      '#fbbf24',  // amber-400
        yellow:     '#facc15',  // yellow-400
        lime:       '#a3e635',  // lime-400
        danger:     '#ef4444',  // red-400
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card:    '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
        'card-md':'0 4px 12px -2px rgba(0,0,0,0.08), 0 2px 6px -2px rgba(0,0,0,0.05)',
        glow:    '0 0 0 3px rgba(100,116,139,0.18)',
        danger:  '0 1px 3px rgba(239,68,68,0.12), 0 0 0 1px rgba(239,68,68,0.2)',
        success: '0 0 0 3px rgba(74,222,128,0.2)',
      },
      animation: {
        pulse_slow: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'alert-ring': 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
