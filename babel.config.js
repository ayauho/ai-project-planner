// babel.config.js - Next.js compatible configuration
module.exports = function(api) {
  // Cache the returned value forever and don't call this function again
  api.cache(true);

  // Determine if we're in production mode
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`Babel running in ${isProduction ? 'production' : 'development'} mode`);

  // Base presets that are used in both dev and prod
  const presets = [
    "@babel/preset-react",
    "@babel/preset-typescript",
    ["@babel/preset-env", { "targets": { "node": "current" } }]
  ];

  // Only use additional plugins in development
  const plugins = isProduction 
    // Minimal plugins for production
    ? [] 
    // Full set of plugins for development
    : [
        "@babel/plugin-syntax-import-attributes",
        ["@babel/plugin-transform-react-jsx", {
          "runtime": "automatic"
        }]
      ];

  return {
    presets,
    plugins
  };
};