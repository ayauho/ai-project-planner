import { BcryptPasswordService } from '../../../lib/auth/password';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs');
jest.mock('@/lib/logger');
jest.mock('@/lib/error');

describe('BcryptPasswordService', () => {
  let service: BcryptPasswordService;

  beforeEach(() => {
    service = new BcryptPasswordService({ saltRounds: 12 });
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      const password = 'testPassword123';
      const result = await service.hashPassword(password);
      
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(`hashed_${password}`);
    });

    it('should throw error when hashing fails', async () => {
      const error = new Error('Hash failed');
      (bcrypt.hash as jest.Mock).mockRejectedValueOnce(error);
      
      await expect(service.hashPassword('test')).rejects.toThrow(error);
    });
  });

  describe('verifyPassword', () => {
    it('should verify password successfully', async () => {
      const password = 'testPassword123';
      const hash = `hashed_${password}`;
      
      const result = await service.verifyPassword(password, hash);
      
      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should fail verification for wrong password', async () => {
      const result = await service.verifyPassword('wrongpass', 'hashed_rightpass');
      expect(result).toBe(false);
    });
  });
});
