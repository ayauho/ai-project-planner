/**
 * Definition for API errors with status code
 */
export interface ApiError extends Error {
    code: number;
  }
  
  /**
   * Create a new API error with a specific status code
   * 
   * @param message Error message
   * @param code HTTP status code
   * @returns ApiError instance
   */
  export function createApiError(message: string, code: number): ApiError {
    const error = new Error(message) as ApiError;
    error.code = code;
    return error;
  }