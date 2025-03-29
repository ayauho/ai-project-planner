'use client';
import React, { useEffect } from 'react';
import { Toast, ToastDescription, ToastTitle, ToastClose } from '@/components/ui/toast';
import { ErrorNotificationProps } from './types';
import { logger } from '@/lib/client/logger';

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  title,
  message,
  duration = 5000,
  onClose
}) => {
  useEffect(() => {
    logger.info('Showing error notification', { title }, 'interaction notification ui');
    const timer = setTimeout(() => {
      logger.info('Error notification timeout', { title }, 'interaction notification lifecycle');
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose, title]);

  return (
    <Toast variant="destructive" role="status">
      <div>
        <ToastTitle role="heading">{title}</ToastTitle>
        <ToastDescription>{message}</ToastDescription>
      </div>
      <ToastClose onClick={onClose} />
    </Toast>
  );
};
