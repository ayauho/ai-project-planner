import bcrypt from 'bcryptjs';
import { IPasswordService, PasswordHashOptions } from './types';
import { logger } from '@/lib/logger';

export class BcryptPasswordService implements IPasswordService {
  private readonly saltRounds: number;

  constructor(options?: PasswordHashOptions) {
    this.saltRounds = options?.saltRounds ?? 12;
  }

  async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error) {
      logger.error('Hash failed', { error }, 'auth password');
      throw error;
    }
  }

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      logger.error('Password verification failed', { error }, 'auth password');
      throw error;
    }
  }
}

export const passwordService = new BcryptPasswordService();
