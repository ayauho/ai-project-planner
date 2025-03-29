import { SignInInput, AuthResult } from '../types';
import { validateSignIn } from '../validation/signInValidation';
import { userSchema } from '@/lib/user';
import { passwordService } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { globalErrorHandler } from '@/lib/error';
import { sign } from 'jsonwebtoken';

export const handleSignIn = async (input: SignInInput): Promise<AuthResult> => {
  try {
    const validationResult = validateSignIn(input);
    if (!validationResult.isValid) {
      throw new Error('Validation failed: ' + validationResult.errors[0].message);
    }

    // Find user
    const user = await userSchema.findByEmail(input.email);
    if (!user) {
      logger.warn('Sign in attempt with non-existent email', { email: input.email }, 'auth sign-in');
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await passwordService.verifyPassword(input.password, user.password);
    if (!isValidPassword) {
      logger.warn('Sign in attempt with invalid password', { userId: user._id?.toString() }, 'auth sign-in');
      throw new Error('Invalid email or password');
    }

    // Update last login
    if (!user._id) {
      throw new Error('User ID is undefined');
    }
    // Convert ObjectId to string to match the expected parameter type
    await userSchema.updateLastLogin(user._id.toString());
    logger.info('User signed in', { userId: user._id }, 'auth sign-in');

    // Generate token
    const token = sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    const { password: _password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  } catch (error) {
    logger.error('Sign in failed', { error }, 'auth sign-in-error');
    globalErrorHandler.handleError(error);
    throw error;
  }
};
