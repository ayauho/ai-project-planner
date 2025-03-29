import { UserValidation } from '../../../lib/user/validation';
import { CreateUserInput } from '../../../lib/user/types';

jest.mock('@/lib/logger');

describe('UserValidation', () => {
  let validation: UserValidation;

  beforeEach(() => {
    validation = new UserValidation();
  });

  const validInput: CreateUserInput = {
    nickname: 'testuser',
    email: 'test@example.com',
    password: 'password123'
  };

  describe('validateCreateInput', () => {
    it('should pass validation for valid input', () => {
      const result = validation.validateCreateInput(validInput);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    describe('nickname validation', () => {
      it('should fail for short nickname', () => {
        const result = validation.validateCreateInput({
          ...validInput,
          nickname: 'ab'
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Nickname must be between 3 and 30 characters');
      });

      it('should fail for invalid characters', () => {
        const result = validation.validateCreateInput({
          ...validInput,
          nickname: 'test@user'
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Nickname can only contain letters, numbers, underscores and hyphens');
      });
    });

    describe('email validation', () => {
      it('should fail for invalid email format', () => {
        const result = validation.validateCreateInput({
          ...validInput,
          email: 'invalid-email'
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid email format');
      });
    });

    describe('password validation', () => {
      it('should fail for short password', () => {
        const result = validation.validateCreateInput({
          ...validInput,
          password: '123'
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must be at least 8 characters long');
      });
    });

    it('should accumulate multiple errors', () => {
      const result = validation.validateCreateInput({
        nickname: 'a@',
        email: 'invalid',
        password: '123'
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
    });
  });
});
