/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: ['src'], // Only run ESLint on the 'src' directory during production builds
    ignoreDuringBuilds: true, // Temporarily ignore ESLint errors during build
  },
  experimental: {
    serverActions: {}
  },
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore TypeScript errors during build
  }
};
export default nextConfig;