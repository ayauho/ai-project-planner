import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingState } from '../../../../../components/workspace/area/loading';

describe('LoadingState', () => {
  it('renders nothing when not loading and no error', () => {
    const { container } = render(<LoadingState isLoading={false} error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading spinner when loading', () => {
    render(<LoadingState isLoading={true} error={null} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders error message when error exists', () => {
    const errorMessage = 'Test error message';
    render(<LoadingState isLoading={false} error={errorMessage} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('prioritizes error over loading state', () => {
    const errorMessage = 'Test error message';
    render(<LoadingState isLoading={true} error={errorMessage} />);
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
