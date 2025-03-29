import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PanelContainer from '../../../../components/workspace/side-panel/panel-container';
import { customRender } from './test-utils';

jest.mock('../../../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn()
  }
}));

const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('PanelContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('renders children and collapse button', () => {
    customRender(
      <PanelContainer>
        <div data-testid="test-content">Test Content</div>
      </PanelContainer>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('toggles collapse state on button click', () => {
    customRender(
      <PanelContainer>
        <div data-testid="test-content">Test Content</div>
      </PanelContainer>
    );

    const contentParent = screen.getByTestId('test-content').parentElement;
    const button = screen.getByRole('button');

    expect(contentParent).toHaveClass('visible');
    fireEvent.click(button);
    expect(contentParent).toHaveClass('invisible');
  });

  it('loads saved state from localStorage', () => {
    mockLocalStorage.getItem.mockReturnValue('true');
    
    customRender(
      <PanelContainer>
        <div data-testid="test-content">Test Content</div>
      </PanelContainer>
    );

    const contentParent = screen.getByTestId('test-content').parentElement;
    expect(contentParent).toHaveClass('invisible');
  });
});
