// babel.config.mjs - with explicit dotenv loading
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to manually load environment variables from .env file
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '.env');
    console.log(`Checking for .env file at: ${envPath}`);
    
    if (fs.existsSync(envPath)) {
      console.log('.env file found, loading variables');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      for (const line of envLines) {
        const [key, value] = line.split('=');
        if (key && value && !process.env[key.trim()]) {
          process.env[key.trim()] = value.trim();
          console.log(`Loaded env var: ${key.trim()}`);
        }
      }
    } else {
      console.log('No .env file found');
    }
  } catch (error) {
    console.error('Error loading .env file:', error);
  }
}

// Load environment variables
loadEnv();

export default function(api) {
  // Cache the returned value forever and don't call this function again
  api.cache(true);

  // Debug environment variables
  console.log('========================');
  console.log('BABEL CONFIG DEBUGGING:');
  console.log(`NODE_ENV from process.env: "${process.env.NODE_ENV}"`);
  console.log('========================');

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
    ? [] // Minimal plugins for production
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
}