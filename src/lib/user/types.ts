import { ObjectId } from 'mongodb';

export interface User {
  _id?: ObjectId;
  nickname: string;
  email: string;
  password: string;
  createdAt: Date;
  lastLogin: Date | null;
}

export interface CreateUserInput {
  nickname: string;
  email: string;
  password: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
