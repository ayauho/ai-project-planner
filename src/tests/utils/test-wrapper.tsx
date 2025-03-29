import React, { ReactNode } from 'react';
import { render, RenderResult } from '@testing-library/react';

export const TestWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <div id="test-wrapper">
      {children}
    </div>
  );
};

export const renderWithWrapper = (component: React.ReactElement): RenderResult => {
  return render(
    <TestWrapper>
      {component}
    </TestWrapper>
  );
};
