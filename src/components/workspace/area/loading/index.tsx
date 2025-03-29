'use client';

import React from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { LoadingStateProps } from './types';

export const LoadingState: React.FC<LoadingStateProps> = ({
  isLoading,
  error,
  className = ''
}) => {
  if (!isLoading && !error) return null;

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div 
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-label="Loading"
    >
      <div 
        className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"
        aria-hidden="true"
      />
      <span className="sr-only">Loading content...</span>
    </div>
  );
};

export default LoadingState;
