'use client';

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmationDialogProps } from './types';
import { logger } from '@/lib/client/logger';

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    logger.info('Starting confirmation action', { title }, 'interaction dialog action');

    try {
      await onConfirm();
      logger.info('Confirmation action completed', { title }, 'interaction dialog action');
    } catch (error) {
      logger.error('Error in confirmation action', { error: String(error), title }, 'interaction dialog error');
      throw error;
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  }, [isLoading, onConfirm, title]);

  const handleCancel = useCallback(() => {
    logger.info('Confirmation canceled', { title }, 'interaction dialog action');
    setIsOpen(false);
    onCancel?.();
  }, [onCancel, title]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !isLoading) {
      logger.info('Dialog closed by user', { title }, 'interaction dialog ui');
      handleCancel();
    }
  }, [handleCancel, isLoading, title]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogTitle className="text-zinc-100 font-medium">{title}</DialogTitle>
        <DialogDescription className="text-zinc-400">{message}</DialogDescription>
        <DialogFooter className="gap-2">
          <Button 
            variant="secondary"
            onClick={handleCancel}
            disabled={isLoading}
            className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
