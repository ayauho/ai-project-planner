'use client';
import React from 'react';
import { ErrorNotificationProps } from './types';
import { logger } from '@/lib/client/logger';
import { Toast } from '@/components/ui/toast';
import { X } from 'lucide-react';

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  title,
  message,
  duration = 7000,
  onClose
}) => {
  return (
    <div className="w-full rounded-lg border-2 border-red-200 bg-red-50 text-red-800 p-4 pr-8 shadow-md relative">
      <div className="font-semibold">{title}</div>
      <div className="text-sm mt-1">{message}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
