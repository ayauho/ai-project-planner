// eslint-disable-next-line no-undef
export const plugins = {
  // Add nesting support BEFORE tailwindcss
  'postcss-nesting': {},

  // Alternative nesting plugin as backup
  'postcss-nested': {},

  // Then process with Tailwind and autoprefixer
  'tailwindcss': {},
  'autoprefixer': {},
};