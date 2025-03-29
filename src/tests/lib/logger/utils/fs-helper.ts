/**
 * File system helper utilities for logger tests
 */
import fs from 'fs';
import path from 'path';

const TEST_LOG_DIR = path.join(process.cwd(), 'src', 'tests', 'temp-logs');

export const getTestLogDir = (): string => TEST_LOG_DIR;

export const cleanTestLogs = (): void => {
  if (!fs.existsSync(TEST_LOG_DIR)) return;
  
  const files = fs.readdirSync(TEST_LOG_DIR);
  files.forEach(file => {
    if (file.startsWith('application-') || file.startsWith('test-')) {
      fs.unlinkSync(path.join(TEST_LOG_DIR, file));
    }
  });
};

export const getLogs = (): string[] => {
  if (!fs.existsSync(TEST_LOG_DIR)) return [];
  
  return fs.readdirSync(TEST_LOG_DIR)
    .filter(file => file.startsWith('application-') || file.startsWith('test-'))
    .map(file => path.join(TEST_LOG_DIR, file));
};

export const readLogFile = (filePath: string): string => {
  if (!filePath) throw new Error('File path is required');
  return fs.readFileSync(filePath, 'utf8');
};

export const setupTestLogDir = (): void => {
  if (!fs.existsSync(TEST_LOG_DIR)) {
    fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
  }
};
