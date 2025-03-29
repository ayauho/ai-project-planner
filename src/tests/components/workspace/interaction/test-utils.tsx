import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { InteractionProvider } from '../../../../components/workspace/interaction';

export const renderWithProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <InteractionProvider>{children}</InteractionProvider>
  );
  
  return render(ui, { wrapper: Wrapper, ...options });
};
