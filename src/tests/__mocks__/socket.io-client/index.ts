const mockOn = jest.fn();
const mockEmit = jest.fn();
const mockDisconnect = jest.fn();

const mockSocket = {
  on: mockOn,
  emit: mockEmit,
  disconnect: mockDisconnect,
  connected: false,
  id: 'mock-socket-id'
};

const mockIo = jest.fn(() => {
  // Set connected to true after small delay to simulate connection
  setTimeout(() => {
    mockSocket.connected = true;
    const connectHandler = mockOn.mock.calls.find(call => call[0] === 'connect')?.[1];
    connectHandler?.();
  }, 0);
  return mockSocket;
});

export default mockIo;
export const mockSocketInstance = mockSocket;
export const resetMocks = () => {
  mockOn.mockClear();
  mockEmit.mockClear();
  mockDisconnect.mockClear();
  mockSocket.connected = false;
  mockIo.mockClear();
};
