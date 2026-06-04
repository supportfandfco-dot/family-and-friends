/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        dark: {
          bg:    '#0d1117',
          panel: '#161b22',
          card:  '#1c2128',
          border:'#30363d',
          hover: '#21262d',
          input: '#0d1117',
        }
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up':   'slideUp 0.3s ease-out',
        'slide-in':   'slideIn 0.25s ease-out',
        'fade-in':    'fadeIn 0.2s ease-out',
        'ping-slow':  'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'wave':       'wave 1.3s ease-in-out infinite',
        'ripple':     'ripple 0.6s ease-out',
        'bounce-in':  'bounceIn 0.4s cubic-bezier(0.68,-0.55,0.27,1.55)',
      },
      keyframes: {
        slideUp:   { from: { transform: 'translateY(20px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideIn:   { from: { transform: 'translateX(-20px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        wave:      { '0%,60%,100%': { transform: 'scaleY(1)' }, '30%': { transform: 'scaleY(2)' } },
        ripple:    { from: { transform: 'scale(0)', opacity: 1 }, to: { transform: 'scale(4)', opacity: 0 } },
        bounceIn:  { from: { transform: 'scale(0.8)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } },
      }
    },
  },
  plugins: [],
}
