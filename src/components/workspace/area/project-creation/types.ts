import { ProjectWithTaskCount } from '@/lib/project/types';

/**
 * Result of project input validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ProjectCreationProps {
  className?: string;
  onProjectCreate: (data: { 
    name: string; 
    description: string; 
    userId: string; 
  }) => Promise<ProjectWithTaskCount>;
}