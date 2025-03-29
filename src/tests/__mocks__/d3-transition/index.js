/* global jest */
const transition = jest.fn(() => ({
  duration: jest.fn(() => ({
    style: jest.fn(() => ({
      style: jest.fn(() => ({
        style: jest.fn(() => ({
          style: jest.fn()
        }))
      }))
    }))
  }))
}));

export { transition };
