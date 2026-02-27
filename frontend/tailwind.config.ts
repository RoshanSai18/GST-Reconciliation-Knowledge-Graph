import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Neutrals (zinc-based, sophisticated off-white palette) ─────────
        bg:         '#F4F4F5',  // zinc-100 — page canvas
        surface:    '#FFFFFF',  // pure white cards
        'surface-2':'#FAFAFA',  // zinc-50 inset panels
        border:     '#E4E4E7',  // zinc-200 — very soft dividers
        foreground: '#18181B',  // zinc-900 — near-black primary text
        ink:        '#27272A',  // zinc-800
        muted:      '#71717A',  // zinc-500 — secondary labels
        subtle:     '#A1A1AA',  // zinc-400 — placeholder / tertiary
        // ── Accent (indigo — vibrant yet formal) ─────────────────────────
        accent:     '#4F46E5',  // indigo-600
        'accent-h': '#4338CA',  // indigo-700 hover
        'accent-lt':'#EEF2FF',  // indigo-50  backgrounds
        // ── Semantic (muted, professional) ────────────────────────────────
        success:    '#059669',  // emerald-600 — stable / valid
        emerald:    '#10B981',  // emerald-500 — charts
        warning:    '#D97706',  // amber-600   — caution
        amber:      '#F59E0B',  // amber-400   — charts
        yellow:     '#CA8A04',  // yellow-600
        lime:       '#65A30D',  // lime-600
        danger:     '#B91C1C',  // red-700 — muted brick red (not screaming)
        'danger-lt':'#FEF2F2',  // red-50 backgrounds
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        widest2: '0.15em',
      },
      boxShadow: {
        // Borderless, diffused shadows for minimal cards
        card:     '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.03)',
        'card-md':'0 4px 16px -4px rgba(0,0,0,0.08), 0 2px 6px -2px rgba(0,0,0,0.04)',
        'card-lg':'0 10px 30px -8px rgba(0,0,0,0.10), 0 4px 10px -4px rgba(0,0,0,0.05)',
        glow:     '0 0 0 3px rgba(79,70,229,0.18)',
        danger:   '0 2px 8px rgba(185,28,28,0.10)',
        success:  '0 0 0 3px rgba(5,150,105,0.18)',
        none: 'none',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'alert-ring':  'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'fade-in':     'fadeIn 0.35s ease-out both',
        'fade-in-up':  'fadeInUp 0.4s ease-out both',
        'slide-in':    'slideIn 0.3s ease-out both',
        'shimmer':     'shimmer 1.6s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(18px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
