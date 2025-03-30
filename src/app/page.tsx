'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authStorage } from '@/lib/client/auth/storage';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuthenticated = await authStorage.isAuthenticated();
        if (isAuthenticated) {
          router.push('/workspace');
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-xl">Loading...</div>
      </main>
    );
  }  return (<main className="flex min-h-screen flex-col items-center justify-center p-24 bg-white"><h1 className="text-4xl font-bold mb-4 text-gray-900">Welcome to AI Project Planner</h1><p className="text-xl text-gray-600 mb-8">Start planning your projects with AI assistance</p><Link
        href="/auth"
        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >Get Started</Link></main>);}
