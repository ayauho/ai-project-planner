export interface ConfirmationDialogProps {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
}
