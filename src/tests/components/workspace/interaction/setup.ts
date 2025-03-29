import React, { ReactNode } from 'react';

// Mock component props interface
interface MockComponentProps {
  children?: ReactNode;
  role?: string;
  'data-testid'?: string;
  onClick?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Mock creator function to ensure type safety
const createMockComponent = (
  role?: string, 
  testId?: string
): React.FC<MockComponentProps> => {
  return ({ children, ...props }) => (
    React.createElement(
      'div', 
      { 
        role, 
        'data-testid': testId, 
        ...props 
      }, 
      children
    )
  );
}

// Create mock components with specific roles and test IDs
const mockToastComponents = {
  Toast: createMockComponent('status', 'toast'),
  ToastTitle: createMockComponent('heading', 'toast-title'),
  ToastDescription: createMockComponent(undefined, 'toast-description'),
  ToastClose: ({ onClick, ...props }: MockComponentProps) => (
    React.createElement(
      'button', 
      { 
        onClick, 
        'data-testid': 'toast-close', 
        ...props 
      }, 
      'Close'
    )
  ),
  ToastProvider: ({ children }: { children?: ReactNode }) => 
    React.createElement(React.Fragment, null, children),
  ToastViewport: () => 
    React.createElement('div', { 'data-testid': 'toast-viewport' })
};

// Use module factory to mock the toast components
jest.mock('@/components/ui/toast', () => mockToastComponents);