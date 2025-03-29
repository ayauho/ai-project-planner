/**
 * Project Selection constants
 * Exports sort options and other constants
 */

export const SORT_OPTIONS = {
  LAST_MODIFIED: 'last-modified',
  CREATION_DATE: 'creation-date',
  ALPHABETICAL: 'alphabetical'
} as const;

export const ERROR_MESSAGES = {
  PROJECT_NOT_FOUND: 'Project not found',
  INVALID_PROJECT_ID: 'Invalid project ID',
  INVALID_SORT_OPTION: 'Invalid sort option'
} as const;
