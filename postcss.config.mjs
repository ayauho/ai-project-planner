// postcss.config.mjs
export default {
  plugins: {
    // Process @import rules first
    'postcss-import': {},
    // Process nested CSS - both plugins for different nesting syntaxes
    'postcss-nested': {},
    'postcss-nesting': {},
    // Tailwind comes after nesting plugins
    'tailwindcss': {},
    // Autoprefixer is last
    'autoprefixer': {}
  }
}
