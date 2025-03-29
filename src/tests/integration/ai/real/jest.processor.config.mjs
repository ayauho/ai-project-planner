/* global process */
import path from 'path';
import { fileURLToPath } from 'url';
import baseConfig from '../../../../../jest.config.base.mjs';
import dotenv from 'dotenv';

// Load environment variables from .env.development
dotenv.config({ path: '.env.development' });

// Ensure NODE_ENV is development
process.env.NODE_ENV = 'development';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../../../');

/** @type {import('jest').Config} */
const config = {
  ...baseConfig,
  rootDir: projectRoot,
  setupFilesAfterEnv: [path.join(__dirname, 'jest.real.setup.ts')],
  moduleDirectories: ['node_modules', projectRoot],
  modulePathIgnorePatterns: [
    "<rootDir>/dist/",
    "<rootDir>/node_modules/",
    "<rootDir>/src/tests/__mocks__/"
  ],
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'development'
  },
  // Override all test pattern configurations
  testMatch: [
    "<rootDir>/src/tests/integration/ai/real/processor.real.test.ts"
  ],
  testPathIgnorePatterns: [],
  testRegex: "",
  testPathPattern: "processor.real.test.ts$"
};

// Export a function to match the root config structure
export default async () => {
  return {
    ...config,
    transformIgnorePatterns: [
      'node_modules/(?!(chalk)/)'
    ],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/src/$1'
    }
  };
};
