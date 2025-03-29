/* global jest */
import { MockSelection } from '../mockBase.js';

const select = jest.fn((element) => new MockSelection(element));

export { select };
