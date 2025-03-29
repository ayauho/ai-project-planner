'use client';

import React from 'react';
import { useTaskOperations } from '@/components/workspace/hooks/useTaskOperations';
import { logger } from '@/lib/client/logger';

interface SplitButtonProps {
  taskId: string;
  childrenCount?: number;
  descendantCount?: number;
  onLoadingChange?: (isLoading: boolean) => void;
}

export const SplitButton: React.FC<SplitButtonProps> = ({ 
  taskId, 
  childrenCount = 0, 
  descendantCount = 0,
  onLoadingChange
}) => {
  const { handleSplit } = useTaskOperations();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    logger.info('Split button clicked', { taskId }, 'controls split-button');
    
    if (isLoading) return;

    try {
      setIsLoading(true);
      onLoadingChange?.(true);

      await handleSplit(taskId);

      logger.info('Split operation completed', { taskId }, 'controls split-button');
    } catch (error) {
      logger.error('Split operation failed', { taskId, error }, 'controls split-button error');
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  if (childrenCount > 0) {
    // Render count display
    return (
      <div 
        className="flex items-center justify-center bg-slate-100 rounded-full px-3 py-1 cursor-default"
        style={{ minWidth: '40px' }}
      >
        <span className="text-sm text-slate-600">
          {childrenCount === descendantCount ? 
            `${childrenCount}` : 
            `${childrenCount}/${descendantCount}`}
        </span>
      </div>
    );
  }

  if (isLoading) {
    // Render loading spinner
    return (
      <div className="relative w-6 h-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  // Render split button
  return (
    <button
      onClick={handleClick}
      className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
      aria-label="Split task"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-slate-600"
      >
        <line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="2" />
        <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  );
};
