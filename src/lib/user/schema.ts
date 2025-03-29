import mongoose from 'mongoose';
import { getModel } from '@/lib/db/models';
import { User, CreateUserInput } from './types';
import { logger } from '@/lib/logger';
import { passwordService } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

// Schema definition
const mongooseUserSchema = new mongoose.Schema<User>({
  nickname: {
    type: String,
    required: [true, 'Nickname is required'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Create indexes
mongooseUserSchema.index({ email: 1 }, { unique: true });
mongooseUserSchema.index({ nickname: 1 }, { unique: true });

const UserModel = getModel<User>('User', mongooseUserSchema);

class UserRepository {
  private async ensureConnection() {
    if (mongoose.connection.readyState !== 1) {
      logger.info('Initializing database connection from user repository', {}, 'database user');
      await initializeDatabase();
    }
  }

  async createUser(input: CreateUserInput): Promise<User> {
    try {
      await this.ensureConnection();
      const now = new Date();
      const userData = {
        nickname: input.nickname,
        email: input.email.toLowerCase(),
        password: await passwordService.hashPassword(input.password),
        createdAt: now,
        lastLogin: now
      };
      const user = new UserModel(userData);
      await user.save();
      
      logger.info('User created successfully', { userId: user._id }, 'database user');
      
      return user.toObject();
    } catch (error) {
      logger.error('Failed to create user', {
        error,
        input: { ...input, password: '[REDACTED]' }
      }, 'database user error');
      
      if (error instanceof Error && error.message.includes('E11000 duplicate key error')) {
        if (error.message.includes('nickname')) {
          throw new Error('This username is already taken. Please choose another one.');
        }
        if (error.message.includes('email')) {
          throw new Error('This email address is already registered. Please use a different email.');
        }
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      await this.ensureConnection();
      const user = await UserModel.findOne({ email: email.toLowerCase() });
      logger.debug('Find by email result', { email, found: !!user }, 'database user');
      return user ? user.toObject() : null;
    } catch (error) {
      logger.error('Failed to find user by email', { error, email }, 'database user error');
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      await this.ensureConnection();

      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        logger.error('Invalid ObjectId format', { id }, 'database user error');
        return null;
      }

      // Convert string to ObjectId
      const objectId = new mongoose.Types.ObjectId(id);
      
      logger.debug('Finding user by id', { id, objectId: objectId.toString() }, 'database user');

      // Find user
      const user = await UserModel.findById(objectId);
      
      if (!user) {
        logger.error('User not found by id', { id }, 'database user error');
        return null;
      }

      logger.debug('User found successfully', { 
        userId: user._id, 
        email: user.email 
      }, 'database user');

      return user.toObject();
    } catch (error) {
      logger.error('Failed to find user by id', { 
        error, 
        id,
        connectionState: mongoose.connection.readyState 
      }, 'database user error');
      throw error;
    }
  }

  async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.ensureConnection();
      
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.error('Invalid ObjectId format', { userId }, 'database user error');
        throw new Error('Invalid user ID format');
      }

      const objectId = new mongoose.Types.ObjectId(userId);
      const result = await UserModel.updateOne(
        { _id: objectId },
        { $set: { lastLogin: new Date() } }
      );
      
      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }
      
      logger.info('Updated user last login', { userId }, 'database user');
    } catch (error) {
      logger.error('Failed to update user last login', { error, userId }, 'database user error');
      throw error;
    }
  }
}

// Create singleton instance
const userRepository = new UserRepository();

// Export repository as default for backward compatibility
export default userRepository;

// Also export as userSchema for existing imports
export const userSchema = userRepository;

// Export model for potential direct use
export { UserModel };
