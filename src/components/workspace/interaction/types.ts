
export interface DialogOptions {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
}

export interface NotificationOptions {
  title: string;
  message: string;
  duration?: number;
}

export interface InteractionContextType {
  showConfirmation: (options: DialogOptions) => Promise<void>;
  showError: (options: NotificationOptions) => void;
}
