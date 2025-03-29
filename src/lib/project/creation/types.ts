import type { CreateProjectInput } from '../types';

export interface NameExtractionResult {
  name: string;
  description: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ProjectCreationOptions {
  validateOnly?: boolean;
}

export interface ProjectCreationService {
  validateInput(input: string): Promise<ValidationResult>;
  processInput(input: string, options?: ProjectCreationOptions): Promise<CreateProjectInput>;
}
