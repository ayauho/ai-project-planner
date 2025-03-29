'use client';

import React from 'react';
import { SplitButton } from './split-button';

interface TaskControlProps {
  taskId: string;
  childrenCount?: number;
  descendantCount?: number;
  onLoadingChange: (isLoading: boolean) => void;
}

export const TaskControl: React.FC<TaskControlProps> = ({
  taskId,
  childrenCount,
  descendantCount,
  onLoadingChange
}) => {
  return (
    <div className="w-[40px] h-[40px] flex items-center justify-center">
      <SplitButton
        taskId={taskId}
        childrenCount={childrenCount}
        descendantCount={descendantCount}
        onLoadingChange={onLoadingChange}
      />
    </div>
  );
};
