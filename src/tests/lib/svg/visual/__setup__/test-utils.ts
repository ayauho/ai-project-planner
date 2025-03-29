/* eslint-disable @typescript-eslint/no-explicit-any */
import { Selection } from 'd3-selection';
import { Transition } from 'd3-transition';

// eslint-disable-next-line unused-imports/no-unused-vars
type D3Fn = (...args: any[]) => any;

interface MockD3Chain {
  empty: jest.Mock<boolean, []>;
  append: jest.Mock<MockD3Chain, [string]>;
  attr: jest.Mock<MockD3Chain, [string, any?]>;
  style: jest.Mock<MockD3Chain, [string, any?, string?]>;
  select: jest.Mock<MockD3Chain, [string]>;
  selectAll: jest.Mock<MockD3Chain, [string]>;
  transition: jest.Mock<MockD3Chain, []>;
  text: jest.Mock<MockD3Chain, [string?]>;
  remove: jest.Mock<void, []>;
  data: jest.Mock<MockD3Chain, [any[], ((...args: any[]) => any)?]>;
  enter: jest.Mock<MockD3Chain, []>;
  exit: jest.Mock<MockD3Chain, []>;
  duration: jest.Mock<MockD3Chain, [number]>;
  [key: string]: jest.Mock;
}

type MockSelection = Selection<any, any, any, any> & MockD3Chain;
type MockTransition = Transition<any, any, any, any> & MockD3Chain;

export function createMockSelection(): MockSelection {
  const mockChain: MockD3Chain = {
    empty: jest.fn().mockReturnValue(false),
    append: jest.fn().mockReturnValue(null),
    attr: jest.fn().mockReturnValue(null),
    style: jest.fn().mockReturnValue(null),
    select: jest.fn().mockReturnValue(null),
    selectAll: jest.fn().mockReturnValue(null),
    transition: jest.fn().mockReturnValue(null),
    text: jest.fn().mockReturnValue(null),
    remove: jest.fn(),
    data: jest.fn().mockReturnValue(null),
    enter: jest.fn().mockReturnValue(null),
    exit: jest.fn().mockReturnValue(null),
    duration: jest.fn().mockReturnValue(null)
  };

  // Make all methods chainable by returning the mock chain
  Object.keys(mockChain).forEach(key => {
    if (key !== 'empty' && key !== 'remove') {
      mockChain[key].mockReturnValue(mockChain);
    }
  });

  return mockChain as unknown as MockSelection;
}

export function createMockGroup() {
  return {
    ownerSVGElement: {
      createSVGPoint: () => ({
        x: 0,
        y: 0,
        matrixTransform: () => ({ x: 0, y: 0 })
      }),
      querySelectorAll: jest.fn(() => []),
      querySelector: jest.fn(() => null),
      getElementById: jest.fn(() => null),
      getBoundingClientRect: () => ({
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 600
      })
    },
    getBBox: () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 100
    }),
    getScreenCTM: () => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
      multiply: jest.fn(),
      inverse: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      scaleNonUniform: jest.fn(),
      rotate: jest.fn()
    }),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(() => null)
  };
}

export function createMockTransition(): MockTransition {
  const mockChain = createMockSelection();
  return {
    ...mockChain,
    duration: jest.fn().mockReturnValue(mockChain)
  } as unknown as MockTransition;
}

// Helper function to verify d3 selection chain calls
export function verifySelectionChain(
  selection: MockSelection | MockTransition,
  expectedCalls: Array<[keyof MockD3Chain, ...any[]]>
) {
  expectedCalls.forEach(([method, ...args]) => {
    expect(selection[method]).toHaveBeenCalledWith(...args);
  });
}
