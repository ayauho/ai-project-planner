'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SignUpForm from '@/components/auth/SignUpForm';
import SignInForm from '@/components/auth/SignInForm';
import { SignUpInput, SignInInput } from '@/lib/auth/types';
import { authStorage } from '@/lib/client/auth/storage';

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const router = useRouter();

  const handleAuthResponse = async (response: Response) =>{
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Authentication failed');
    }

    await authStorage.setSession({
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt
    });

    router.push('/workspace');
  };

  const handleSignUpSubmit = async (data: SignUpInput) =>{
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'signup',
          ...data
        }),
      });
      await handleAuthResponse(response);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Sign up failed');
    }
  };

  const handleSignInSubmit = async (data: SignInInput) =>{
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'signin',
          ...data
        }),
      });
      await handleAuthResponse(response);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Sign in failed');
    }
  };

  return (<div className="min-h-screen flex flex-col justify-center bg-white py-12 sm:px-6 lg:px-8 auth-container"><div className="sm:mx-auto sm:w-full sm:max-w-md"><h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">{activeTab === 'signin' ? 'Sign in to your account' : 'Create your account'}</h2></div><div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"><div className="bg-white py-8 px-6 shadow sm:rounded-lg sm:px-10"><div className="grid grid-cols-2 gap-2 mb-8 w-full">
              <button
                onClick={() =>setActiveTab('signin')}
                className={`text-base font-medium py-2 rounded-lg transition-colors ${
                  activeTab === 'signin'
                    ? 'text-blue-700 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >Sign in</button>
              <button
                onClick={() =>setActiveTab('signup')}
                className={`text-base font-medium py-2 rounded-lg transition-colors ${
                  activeTab === 'signup'
                    ? 'text-blue-700 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >Sign up</button>
            </div>{activeTab === 'signin' ? (<SignInForm onSubmit={handleSignInSubmit} />) : (<SignUpForm onSubmit={handleSignUpSubmit} />)}</div></div></div>);
}
