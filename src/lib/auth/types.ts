import { User } from '@/lib/user/types';

export interface SignUpInput {
  nickname: string;
  email: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, 'password'>;
  token: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
};

export interface PasswordHashOptions {
  saltRounds?: number;
}

export interface IPasswordService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
}
