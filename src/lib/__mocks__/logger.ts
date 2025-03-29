const debug = jest.fn();
const info = jest.fn();
const warn = jest.fn();
const error = jest.fn();

export const logger = {
  debug,
  info,
  warn,
  error
};

export default logger;
