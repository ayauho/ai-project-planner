import { logger } from '@/lib/logger';
import { ErrorReporter, ProcessedError } from './types';

export class ErrorReporterImpl implements ErrorReporter {
  reportError(processedError: ProcessedError): void {
    const { errorId, details, level } = processedError;
    const logContext = {
      errorId,
      ...details,
      timestamp: processedError.timestamp
    };

    logger[level](details.message, logContext, 'error-reporting');
  }
}

export const errorReporter = new ErrorReporterImpl();
