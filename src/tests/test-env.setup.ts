class MockTextEncoder {
  encode(input?: string): Uint8Array {
    return new Uint8Array(Buffer.from(input || ''));
  }
}

class MockTextDecoder {
  decode(input?: Uint8Array): string {
    if (!input) return '';
    return Buffer.from(input).toString();
  }
}

Object.defineProperty(global, 'TextEncoder', {
  value: MockTextEncoder
});

Object.defineProperty(global, 'TextDecoder', {
  value: MockTextDecoder
});

// Add setImmediate for winston
Object.defineProperty(global, 'setImmediate', {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  value: (callback: Function) => setTimeout(callback, 0)
});