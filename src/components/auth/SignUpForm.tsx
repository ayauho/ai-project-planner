'use client';

import { useState } from 'react';
import { SignUpInput } from '@/lib/auth/types';

interface ValidationError {
  field: string;
  message: string;
}

interface SignUpFormProps {
  onSubmit: (data: SignUpInput) => Promise<void>;
}

export default function SignUpForm({ onSubmit }: SignUpFormProps) {
  const [formData, setFormData] = useState<SignUpInput>({
    nickname: '',
    email: '',
    password: ''
  });

  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setIsLoading(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      // Check for field-specific errors
      if (message.includes('username')) {
        setErrors([{ field: 'nickname', message }]);
      } else if (message.includes('email')) {
        setErrors([{ field: 'email', message }]);
      } else {
        setErrors([{ field: 'form', message }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getFieldError = (field: string) => 
    errors.find(error => error.field === field)?.message;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* General form error */}
      {getFieldError('form') && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{getFieldError('form')}</div>
        </div>
      )}

      <div>
        <label htmlFor="nickname" className="block text-sm font-medium leading-6 text-gray-900">
          Nickname
        </label>
        <div className="mt-2">
          <input
            id="nickname"
            name="nickname"
            type="text"
            autoComplete="nickname"
            required
            className={`form-input-base ${getFieldError('nickname') ? 'border-red-300' : ''}`}
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            disabled={isLoading}
          />
          {getFieldError('nickname') && (
            <p className="mt-2 text-sm text-red-600">{getFieldError('nickname')}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
          Email
        </label>
        <div className="mt-2">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`form-input-base ${getFieldError('email') ? 'border-red-300' : ''}`}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={isLoading}
          />
          {getFieldError('email') && (
            <p className="mt-2 text-sm text-red-600">{getFieldError('email')}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
          Password
        </label>
        <div className="mt-2">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className={`form-input-base ${getFieldError('password') ? 'border-red-300' : ''}`}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={isLoading}
          />
          {getFieldError('password') && (
            <p className="mt-2 text-sm text-red-600">{getFieldError('password')}</p>
          )}
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="btn-primary"
          disabled={isLoading}
        >
          {isLoading ? 'Signing up...' : 'Sign up'}
        </button>
      </div>
    </form>
  );
}
