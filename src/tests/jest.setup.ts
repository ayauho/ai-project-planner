import '@testing-library/jest-dom';

// Mock localStorage with complete Storage interface
const createLocalStorageMock = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: jest.fn((key: string): string | null => store[key] || null),
    setItem: jest.fn((key: string, value: string): void => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string): void => {
      delete store[key];
    }),
    clear: jest.fn((): void => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: jest.fn((index: number): string | null => {
      return Object.keys(store)[index] || null;
    }),
    get length(): number {
      return Object.keys(store).length;
    },
    [Symbol.iterator]: function* (): Iterator<string> {
      yield* Object.keys(store);
    }
  };
};

Object.defineProperty(window, 'localStorage', {
  value: createLocalStorageMock()
});

// Existing mocks
global.fetch = jest.fn();

// Add any other global mocks or setup here
