import { validateProjectInput } from '../../../../lib/project/creation/validation';
import { VALIDATION_MESSAGES } from '../../../../lib/project/creation/constants';

describe('validateProjectInput', () => {
  it('should validate valid input', () => {
    const input = 'Project Name - This is a valid project description that meets the minimum length requirement';
    const result = validateProjectInput(input);
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty input', () => {
    const result = validateProjectInput('');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(VALIDATION_MESSAGES.EMPTY_INPUT);
  });

  it('should reject too short input', () => {
    const input = 'Too short';
    const result = validateProjectInput(input);
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(VALIDATION_MESSAGES.DESCRIPTION_TOO_SHORT);
  });
});
