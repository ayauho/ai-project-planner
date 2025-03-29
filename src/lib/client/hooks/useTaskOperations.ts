'use client';

import { useState } from 'react';
import { taskGenerator } from '@/lib/task/operations';

export function useTaskOperations() {
  const [isLoading, setLoading] = useState(false);
  
  return {
    taskGenerator,
    isLoading,
    setLoading
  };
}
