/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
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
      },
    },
  },
  plugins: [],
};
