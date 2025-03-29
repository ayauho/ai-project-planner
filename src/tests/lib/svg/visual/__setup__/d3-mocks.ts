/* eslint-disable @typescript-eslint/no-explicit-any */
function createD3Chain() {
  const handler = {
    get: (target: any, prop: string) => {
      if (prop === 'empty') return () => false;
      if (prop === 'nodes') return () => [{ textContent: 'mock text' }];
      if (prop === 'size') return () => 2;
      if (prop === 'style') return () => '0.5';
      
      return (..._args: any[]) => new Proxy({}, handler);
    }
  };
  
  return new Proxy({}, handler);
}

const mockChain = createD3Chain();

export const d3Mocks = {
  selection: {
    select: () => mockChain,
    append: () => mockChain,
    attr: () => mockChain,
    style: () => mockChain,
    text: () => mockChain,
    selectAll: () => mockChain
  },
  transition: {
    transition: jest.fn(() => ({
      duration: () => mockChain
    }))
  }
};
