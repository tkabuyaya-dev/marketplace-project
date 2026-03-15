/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#2d3748',
          850: '#1a202c',
          950: '#0b0f19',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        'safe': 'env(safe-area-inset-bottom)',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      },
      scale: {
        '98': '0.98',
      }
    }
  },
  plugins: [],
  // Safelist: classes générées dynamiquement (Tailwind ne peut pas les détecter via scan)
  safelist: [
    // Thèmes dynamiques: primary colors
    { pattern: /bg-(blue|rose|cyan|amber|purple|green|red|yellow)-(400|500|600|700|800|900)/ },
    { pattern: /text-(blue|rose|cyan|amber|purple|green|red|yellow)-(300|400|500|600)/ },
    { pattern: /border-(blue|rose|cyan|amber|purple|green|red|yellow)-(400|500|600|900)/ },
    { pattern: /shadow-(blue|rose|cyan|amber|purple|green|red|yellow)-(500|900)/ },
    { pattern: /from-(blue|rose|cyan|amber|purple|green|red|yellow)-(400|500|600|950)/ },
    { pattern: /to-(blue|rose|cyan|amber|purple|green|red|yellow)-(400|500|600|950)/ },
    { pattern: /via-(blue|rose|indigo|pink|slate)-(900)/ },
    // Opacity modifiers for dynamic theme classes
    'shadow-blue-500/25', 'shadow-rose-500/25',
    'shadow-blue-900/50', 'shadow-rose-900/50',
    'shadow-blue-600/30', 'shadow-rose-600/30',
    'text-blue-400/70', 'text-rose-400/70',
    'bg-blue-500/10', 'bg-rose-500/10', 'bg-green-500/10', 'bg-yellow-500/10', 'bg-red-500/10',
    // Animations
    'animate-fade-in', 'animate-slide-up', 'animate-pulse',
    // Scale
    'active:scale-[0.98]', 'active:scale-95',
    // Scrollbar
    'scrollbar-hide',
  ]
};
