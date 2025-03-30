/** @type {import('tailwindcss').Config} */
export const content = [
  './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  './src/components/**/*.{js,ts,jsx,tsx,mdx}',
];
export const theme = {
  extend: {},
};
export const plugins = [
  require('@tailwindcss/forms'),
];
