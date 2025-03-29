import { extractProjectName } from '@/lib/project/creation/extract-name';
import { VALIDATION_MESSAGES } from '@/lib/project/creation/constants';

describe('extractProjectName', () => {
  it('should extract name using dash separator', () => {
    const input = 'Blog Project-Create a simple blog system';
    const result = extractProjectName(input);
    expect(result).toEqual({
      name: 'Blog Project',
      description: 'Create a simple blog system'
    });
  });

  it('should extract name using sentence format', () => {
    const input = 'Blog Project. Create a simple blog system';
    const result = extractProjectName(input);
    expect(result).toEqual({
      name: 'Blog Project',
      description: 'Create a simple blog system'
    });
  });

  it('should extract name using new line separator', () => {
    const input = 'Blog Project\nCreate a simple blog system';
    const result = extractProjectName(input);
    expect(result).toEqual({
      name: 'Blog Project',
      description: 'Create a simple blog system'
    });
  });

  it('should use entire input as description when no separator found', () => {
    const input = 'Create a simple blog system with authentication and post management';
    const result = extractProjectName(input);
    expect(result).toEqual({
      name: 'New Project',
      description: input
    });
  });

  it('should throw error for empty input', () => {
    expect(() => extractProjectName('')).toThrow(VALIDATION_MESSAGES.EMPTY_INPUT);
  });

  it('should throw error for too short input', () => {
    expect(() => extractProjectName('Short')).toThrow(VALIDATION_MESSAGES.DESCRIPTION_TOO_SHORT);
  });

  it('should handle multiple sentences in description', () => {
    const input = 'Blog Project. This is a blog system. It has many features.';
    const result = extractProjectName(input);
    expect(result).toEqual({
      name: 'Blog Project',
      description: 'This is a blog system. It has many features.'
    });
  });

  it('should handle dash with multiple parts', () => {
    const input = 'Blog-Auth-System-A full featured blog system';
    const result = extractProjectName(input);
    expect(result).toEqual({
      name: 'Blog',
      description: 'Auth-System-A full featured blog system'
    });
  });
});
