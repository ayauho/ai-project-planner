import { FormatBuilder } from '../../../../../lib/ai/request/builder/format';
import { ValidationError } from '../../../../../lib/ai/request/errors';
import logger from '../../../../../lib/logger';

jest.mock('../../../../../lib/logger');

describe('FormatBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds decompose format correctly', () => {
    const builder = new FormatBuilder({ operation: 'decompose' });
    const format = builder.build();
    
    expect(format).toContain('JSON array of tasks');
    expect(format).toContain('name: string');
    expect(format).toContain('description: string');
    expect(logger.debug).toHaveBeenCalledWith('Building response format', { operation: 'decompose' });
  });

  it('builds split format correctly', () => {
    const builder = new FormatBuilder({ operation: 'split' });
    const format = builder.build();
    
    expect(format).toContain('JSON array of subtasks');
    expect(format).toContain('name: string');
    expect(format).toContain('description: string');
  });

  it('builds regenerate format correctly', () => {
    const builder = new FormatBuilder({ operation: 'regenerate' });
    const format = builder.build();
    
    expect(format).toContain('JSON object');
    expect(format).toContain('name: string');
    expect(format).toContain('description: string');
  });

  it('throws error for invalid operation', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new FormatBuilder({ operation: 'invalid' as any });
    expect(() => builder.build()).toThrow(ValidationError);
  });
});
