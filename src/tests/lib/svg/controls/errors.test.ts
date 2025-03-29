import { ControlError, ControlEventError, ControlStateError } from '../../../../lib/svg/controls/errors';

describe('Control Errors', () => {
  describe('ControlError', () => {
    it('should create error with message and context', () => {
      const context = { id: 'test' };
      const error = new ControlError('test error', context);
      
      expect(error.message).toBe('test error');
      expect(error.context).toBe(context);
      expect(error.name).toBe('ControlError');
    });

    it('should create error without context', () => {
      const error = new ControlError('test error');
      
      expect(error.message).toBe('test error');
      expect(error.context).toBeUndefined();
    });
  });

  describe('ControlEventError', () => {
    it('should create error with message, event type and context', () => {
      const context = { id: 'test' };
      const error = new ControlEventError('test error', 'expand', context);
      
      expect(error.message).toBe('test error');
      expect(error.eventType).toBe('expand');
      expect(error.context).toBe(context);
      expect(error.name).toBe('ControlEventError');
    });
  });

  describe('ControlStateError', () => {
    it('should create error with message, state and context', () => {
      const context = { id: 'test' };
      const error = new ControlStateError('test error', 'active', context);
      
      expect(error.message).toBe('test error');
      expect(error.state).toBe('active');
      expect(error.context).toBe(context);
      expect(error.name).toBe('ControlStateError');
    });
  });
});
