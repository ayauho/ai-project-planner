// postcss.config.mjs
export default {
  plugins: {
    'tailwindcss': {},
    'autoprefixer': {},
    'postcss-nested': {}, // Only use one nesting plugin
  }
};