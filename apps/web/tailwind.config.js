/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        smart: {
          navy: '#142B4A',
          blue: '#2878F0',
          cyan: '#20C4D8',
          bg: '#F3F6FB',
          card: '#FFFFFF',
          text: '#182B45',
          muted: '#627D98',
          border: '#E2E8F0',
          success: '#16A675',
          warning: '#F0A43A',
          danger: '#E12D39'
        }
      },
      boxShadow: {
        'smart-sm': '0 2px 8px rgba(20, 43, 74, 0.04)',
        'smart': '0 8px 24px rgba(20, 43, 74, 0.06)',
        'smart-lg': '0 16px 36px rgba(40, 120, 240, 0.12)',
        'smart-glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)'
      }
    },
  },
  plugins: [],
}
