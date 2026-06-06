/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans JP', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 20px 55px rgba(20, 35, 50, 0.13)',
      },
    },
  },
  plugins: [],
};
