/** @type {import('tailwindcss').Config} */
export const content = [
  './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  // Add this line specifically for your auth page
  './src/app/auth/**/*.{js,ts,jsx,tsx,mdx}',
];

export const mode = 'jit'; // Make sure this is consistent

// If needed, you can temporarily disable purging for debugging
export const purge = false;
export const theme = {
  extend: {},
};
export const plugins = [
  require('@tailwindcss/forms'),
];
