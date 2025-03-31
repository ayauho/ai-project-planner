'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ErrorToastProps {
  title: string;
  message: string;
  onClose?: () => void;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({
  title,
  message,
  onClose
}) => {
  // Auto-close the toast after the specified duration
  useEffect(() => {
    if (onClose) {
      // Auto-dismiss after 7 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 7000);
      
      return () => clearTimeout(timer);
    }
  }, [onClose]);

  return (
    <div className="w-full rounded-lg border-2 border-red-200 bg-red-50 text-red-800 p-4 pr-8 shadow-md relative">
      {/* Error title */}
      <div className="font-semibold">{title}</div>
      {/* Error message */}
      <div className="text-sm mt-1">{message}</div>
      {/* Close button */}
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
