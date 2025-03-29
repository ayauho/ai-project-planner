/**
 * Test environment configuration
 */
import logger from '../../../../lib/logger';

beforeAll(() => {
  logger.enableTestMode();
});

afterAll(() => {
  logger.disableTestMode();
});

beforeEach(() => {
  logger.clearTestLogs();
});
