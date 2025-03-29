import React from 'react';
import { render } from '@testing-library/react';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronLeft: () => <div data-testid="chevron-left-icon" />,
  ChevronRight: () => <div data-testid="chevron-right-icon" />
}));

export const customRender = (ui: React.ReactElement) => {
  return render(ui);
};
