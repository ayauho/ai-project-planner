'use client';

import { useState } from 'react';
import { SignInInput, ValidationError } from '@/lib/auth/types';

interface SignInFormProps {
  onSubmit: (data: SignInInput) =>Promise<void>;
}

export default function SignInForm({ onSubmit }: SignInFormProps) {
  const [formData, setFormData] = useState<SignInInput>({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) =>{
    e.preventDefault();
    setErrors([]);
    setIsLoading(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      setErrors([{
        field: 'form',
        message: error instanceof Error ? error.message : 'Sign in failed'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (<form onSubmit={handleSubmit} className="space-y-6 w-full">{errors.map((error, index) =>(<div key={index} className="rounded-md bg-red-50 p-4"><div className="text-sm text-red-700">{error.message}</div></div>))}<div><label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">Email</label><div className="mt-2"><input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="form-input-base text-gray-900 w-full px-3 py-2 border border-gray-300 rounded-md"
            value={formData.email}
            onChange={(e) =>setFormData({ ...formData, email: e.target.value })}
            disabled={isLoading}
          /></div></div><div><label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">Password</label><div className="mt-2"><input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="form-input-base text-gray-900 w-full px-3 py-2 border border-gray-300 rounded-md"
            value={formData.password}
            onChange={(e) =>setFormData({ ...formData, password: e.target.value })}
            disabled={isLoading}
          /></div></div><div className="mt-6"><button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md"
          disabled={isLoading}
        >{isLoading ? 'Signing in...' : 'Sign in'}</button></div></form>);
}
