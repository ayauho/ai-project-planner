export default {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
        '@babel/preset-react'  // Added React preset
    ],
    plugins: [
        '@babel/plugin-syntax-import-attributes',
        ['@babel/plugin-transform-react-jsx', {
            runtime: 'automatic'  // Use new React transform
        }]
    ]
};