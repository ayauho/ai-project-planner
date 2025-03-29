import path from 'path';
import { fileURLToPath } from 'url';
import baseConfig from '../../../../../jest.config.base.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../../../');

/** @type {import('jest').Config} */
const config = {
  ...baseConfig,
  rootDir: projectRoot,
  setupFilesAfterEnv: [path.join(__dirname, 'jest.real.setup.ts')],
  testMatch: [
    "**/real/**/*.real.test.ts"
  ],
  moduleDirectories: ['node_modules', projectRoot],
  modulePathIgnorePatterns: [
    "<rootDir>/dist/",
    "<rootDir>/node_modules/",
    "<rootDir>/src/tests/__mocks__/"
  ]
};

export default config;
