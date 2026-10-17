import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: { colors: { ink: '#0b1020', panel: '#111a2b', primary: '#3b82f6' } } },
  plugins: []
};
export default config;
