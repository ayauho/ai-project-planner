/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

const Toast = ({ children, ...props }: any) => (
  <div role="status" data-testid="toast" {...props}>
    {children}
  </div>
);

const ToastTitle = ({ children, ...props }: any) => (
  <div role="heading" data-testid="toast-title" {...props}>
    {children}
  </div>
);

const ToastDescription = ({ children, ...props }: any) => (
  <div data-testid="toast-description" {...props}>
    {children}
  </div>
);

const ToastClose = ({ onClick, ...props }: any) => (
  <button onClick={onClick} data-testid="toast-close" {...props}>
    Close
  </button>
);

const ToastProvider = ({ children }: any) => <>{children}</>;
const ToastViewport = () => <div data-testid="toast-viewport" />;

export {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastProvider,
  ToastViewport
};
