export interface ErrorNotificationProps {
  title: string;
  message: string;
  duration?: number;
  onClose: () => void;
}
