const jwtMock = {
  sign: jest.fn().mockReturnValue('mocked-token'),
  verify: jest.fn().mockImplementation((token) => {
    if (token === 'valid-token' || token === 'mocked-token') {
      return { userId: 'test-user', sessionId: 'test-session' };
    }
    throw new Error('Invalid token');
  }),
};

export default jwtMock;
