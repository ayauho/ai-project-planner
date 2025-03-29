/**
 * Setup environment for logger tests
 */

import { setupTestLogDir, cleanTestLogs } from './utils/fs-helper';

// Ensure test logs directory exists
setupTestLogDir();

// Clean up any existing test logs
cleanTestLogs();

// Set up global test timeout
jest.setTimeout(10000);
