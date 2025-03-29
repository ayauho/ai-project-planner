// Constants for request management
export const DEFAULT_TIMEOUT = 30000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_TEMPERATURE = 0.7;

export const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
};

export const ERROR_MESSAGES = {
  API_KEY_MISSING: 'OpenAI API key not found',
  REQUEST_FAILED: 'Request to OpenAI API failed',
  INVALID_RESPONSE: 'Invalid response format from OpenAI API',
  RATE_LIMIT: 'Rate limit exceeded',
  TIMEOUT: 'Request timeout',
};

export const OPENAI_CONFIG = {
  model: 'gpt-4o-mini',
  temperature: DEFAULT_TEMPERATURE,
  timeout: DEFAULT_TIMEOUT,
};
