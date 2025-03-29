import React from 'react';
import { render } from '@testing-library/react';
import { StateProvider } from '../../lib/state/context';

export function renderWithState(ui: React.ReactElement) {
  return render(
    <StateProvider>
      {ui}
    </StateProvider>
  );
}
