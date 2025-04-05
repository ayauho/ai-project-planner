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

  const handleConfirm = useCallback(async (e: React.MouseEvent) => {
    // Stop event propagation to prevent side panel collapse
    e.stopPropagation();
    e.preventDefault();
    
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
      
      // Remove the dialog-active class when dialog closes
      document.body.classList.remove('dialog-active');
    }
  }, [isLoading, onConfirm, title]);

  const handleCancel = useCallback((e?: React.MouseEvent) => {
    // Stop event propagation to prevent side panel collapse if event is provided
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    logger.info('Confirmation canceled', { title }, 'interaction dialog action');
    setIsOpen(false);
    onCancel?.();
    
    // Remove the dialog-active class when dialog closes
    document.body.classList.remove('dialog-active');
  }, [onCancel, title]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !isLoading) {
      logger.info('Dialog closed by user', { title }, 'interaction dialog ui');
      handleCancel();
    }
  }, [handleCancel, isLoading, title]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="bg-zinc-900 border-zinc-800 project-delete-confirm delete-project-dialog fixed"
        onClick={(e) => e.stopPropagation()} // Stop clicks on the dialog from propagating
        onMouseDown={(e) => e.stopPropagation()} // Also stop mousedown events
        data-delete-dialog="true"
        style={{ 
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '90vw',
          width: 'auto',
          minWidth: '300px',
          maxHeight: '90vh',
          margin: '0'
        }}
      >
        <DialogTitle className="text-zinc-100 font-medium">{title}</DialogTitle>
        <DialogDescription className="text-zinc-400">{message}</DialogDescription>
        <DialogFooter className="gap-2">
          <Button 
            variant="secondary"
            onClick={handleCancel}
            disabled={isLoading}
            className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-100"
            data-delete-dialog-button="cancel"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            data-delete-dialog-button="confirm"
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
