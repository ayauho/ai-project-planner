const mockRuntime = {
  fetch: jest.fn(),
  FormData: jest.fn(),
  Headers: jest.fn(),
  Request: jest.fn(),
  Response: jest.fn(),
  ReadableStream: jest.fn(),
  getMultipartRequestOptions: jest.fn(),
  getDefaultAgent: jest.fn(),
  fileFromPath: jest.fn(),
};

// Mock the OpenAI runtime
jest.mock('openai/_shims/web-runtime', () => ({
  getRuntime: () => mockRuntime
}));

// Mock the main OpenAI module
jest.mock('openai');
