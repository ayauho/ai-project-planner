import { SignUpInput, AuthResult } from '../types';
import { validateSignUp } from '../validation/signUpValidation';
import { userSchema } from '@/lib/user';
import { logger } from '@/lib/logger';
import { sign } from 'jsonwebtoken';

export const handleSignUp = async (input: SignUpInput): Promise<AuthResult> => {
  try {
    const validationResult = validateSignUp(input);
    if (!validationResult.isValid) {
      throw new Error(validationResult.errors[0].message);
    }

    // Create user (MongoDB duplicate key error will be caught if nickname exists)
    const user = await userSchema.createUser(input);
    logger.info('New user created', { userId: user._id }, 'auth sign-up');

    // Generate token
    const token = sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    const { password: _password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  } catch (error) {
    logger.error('Sign up failed', { error }, 'auth sign-up-error');
    // Preserve the error message
    throw error;
  }
};
