import { OpenAIKeyValidator } from '../../../../lib/ai/config/validator';
import { ApiKeyConfig } from '../../../../lib/ai/config/types';
import { ApiKeyValidationError } from '../../../../lib/ai/config/errors';
import { VALID_API_KEY, INVALID_API_KEY } from './mocks/openai';
import './setup';

jest.mock('../../../../lib/logger');

describe('OpenAIKeyValidator', () => {
  const mockConfig: ApiKeyConfig = {
    storageKey: 'test-key',
    encryptionKey: 'test-encryption',
    provider: 'openai',
    validationEndpoint: 'https://api.openai.com/v1/models'
  };

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    (global.fetch as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Development Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.USE_DEV_AI_API_KEY = 'true';
    });

    it('should skip validation and return true', async () => {
      const validator = new OpenAIKeyValidator(mockConfig);
      const isValid = await validator.validateKey('any-key');
      expect(isValid).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Production Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should validate valid API key', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 200 });
      
      const validator = new OpenAIKeyValidator(mockConfig);
      const isValid = await validator.validateKey(VALID_API_KEY);
      
      expect(isValid).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        mockConfig.validationEndpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${VALID_API_KEY}`
          })
        })
      );
    });

    it('should invalidate incorrect API key', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 401 });
      
      const validator = new OpenAIKeyValidator(mockConfig);
      const isValid = await validator.validateKey(INVALID_API_KEY);
      
      expect(isValid).toBe(false);
    });

    it('should throw on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      const validator = new OpenAIKeyValidator(mockConfig);
      await expect(validator.validateKey(VALID_API_KEY))
        .rejects
        .toThrow(ApiKeyValidationError);
    });
  });
});
