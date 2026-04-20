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
          950: '#111318',
        },
        gold: {
          50:  '#FFF9E6',
          100: '#FFF0BF',
          200: '#FFE080',
          300: '#FFD866',
          400: '#F5C842',
          500: '#E6B830',
          600: '#D4941A',
          700: '#B37A14',
          800: '#8C5E0F',
          900: '#664409',
          950: '#3D2805',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Inter Fallback', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        'safe': 'env(safe-area-inset-bottom)',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'card-in':  'cardIn 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'shimmer':  'shimmer 1.8s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        cardIn: {
          '0%':   { opacity: '0', transform: 'translateY(14px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          'from': { transform: 'translateX(-100%)' },
          'to':   { transform: 'translateX(200%)' },
        },
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
    { pattern: /bg-(blue|rose|cyan|amber|purple|green|red|yellow|gold)-(400|500|600|700|800|900)/ },
    { pattern: /text-(blue|rose|cyan|amber|purple|green|red|yellow|gold)-(300|400|500|600)/ },
    { pattern: /border-(blue|rose|cyan|amber|purple|green|red|yellow|gold)-(400|500|600|900)/ },
    { pattern: /shadow-(blue|rose|cyan|amber|purple|green|red|yellow|gold)-(500|900)/ },
    { pattern: /from-(blue|rose|cyan|amber|purple|green|red|yellow|gold)-(400|500|600|950)/ },
    { pattern: /to-(blue|rose|cyan|amber|purple|green|red|yellow|gold)-(400|500|600|950)/ },
    { pattern: /via-(blue|rose|indigo|pink|slate|gold)-(900)/ },
    // Opacity modifiers for dynamic theme classes
    'shadow-gold-400/25', 'shadow-gold-400/20', 'shadow-gold-900/50',
    'shadow-gold-600/30', 'shadow-blue-500/25', 'shadow-rose-500/25',
    'shadow-blue-900/50', 'shadow-rose-900/50',
    'shadow-blue-600/30', 'shadow-rose-600/30',
    'text-gold-400/70', 'text-blue-400/70', 'text-rose-400/70',
    'bg-gold-400/10', 'bg-gold-400/8', 'bg-gold-600/5',
    'bg-blue-500/10', 'bg-rose-500/10', 'bg-green-500/10', 'bg-yellow-500/10', 'bg-red-500/10',
    // Animations
    'animate-fade-in', 'animate-slide-up', 'animate-pulse', 'animate-card-in', 'animate-shimmer',
    // Scale
    'active:scale-[0.98]', 'active:scale-95',
    // Scrollbar
    'scrollbar-hide',
  ]
};
