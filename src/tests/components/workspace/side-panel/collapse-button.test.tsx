import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CollapseButton from '../../../../components/workspace/side-panel/collapse-button';
import { customRender } from './test-utils';

describe('CollapseButton', () => {
  const mockToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correct icon based on collapsed state', () => {
    const { rerender } = customRender(
      <CollapseButton isCollapsed={false} onToggle={mockToggle} />
    );

    expect(screen.getByTestId('chevron-left-icon')).toBeInTheDocument();

    rerender(
      <CollapseButton isCollapsed={true} onToggle={mockToggle} />
    );
    expect(screen.getByTestId('chevron-right-icon')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', () => {
    customRender(
      <CollapseButton isCollapsed={false} onToggle={mockToggle} />
    );
    
    fireEvent.click(screen.getByRole('button'));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });
});
