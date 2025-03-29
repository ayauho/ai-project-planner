import React from 'react';

const createMockComponent = (name: string) => {
  const Component = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} data-testid={`mock-${name.toLowerCase()}`} role="status" {...props}>
        {children}
      </div>
    )
  );
  Component.displayName = name;
  return Component;
};

// Export both primitive components and main components
export const Root = createMockComponent('Toast');
export const Viewport = createMockComponent('ToastViewport');
export const Title = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => (
    <div ref={ref} role="heading" {...props}>
      {children}
    </div>
  )
);
Title.displayName = 'ToastTitle';

export const Description = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
);
Description.displayName = 'ToastDescription';

export const Close = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ children, onClick, ...props }, ref) => (
    <button ref={ref} type="button" onClick={onClick} {...props}>
      {children || 'Close'}
    </button>
  )
);
Close.displayName = 'ToastClose';

export const Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div data-testid="mock-toast-provider">{children}</div>;
};
Provider.displayName = 'ToastProvider';

// Re-export for consistency with Radix UI
export const Toast = Root;
export const ToastViewport = Viewport;
export const ToastTitle = Title;
export const ToastDescription = Description;
export const ToastClose = Close;
export const ToastProvider = Provider;

// Export interfaces
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

export interface ToastActionElement {
  altText?: string;
  onClick?: () => void;
}
