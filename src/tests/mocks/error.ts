jest.mock('@/lib/error', () => ({
  globalErrorHandler: {
    handleError: jest.fn(),
    handlePromiseRejection: jest.fn()
  }
}));
