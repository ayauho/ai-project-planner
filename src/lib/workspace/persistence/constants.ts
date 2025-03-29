'use client';

export const STORAGE_KEY_BASE = 'workspace-state';
export const STORAGE_KEY = 'workspace-state';
export const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
export const STATE_EXPIRY_DAYS = 30; // 30 days

/**
 * Get user-specific base storage key
 */
export const getUserStorageKeyBase = (userId: string | null | undefined): string => {
  if (!userId) {
    return STORAGE_KEY_BASE; // Fallback for backward compatibility
  }
  return `${STORAGE_KEY_BASE}-user-${userId}`;
};

/**
 * Get main user-specific storage key
 */
export const getUserStorageKey = (userId: string | null | undefined): string => {
  if (!userId) {
    return STORAGE_KEY; // Fallback for backward compatibility
  }
  return `${STORAGE_KEY_BASE}-user-${userId}`;
};

/**
 * Get project-specific storage key
 * Now includes user ID for proper isolation
 */
export const getProjectStorageKey = (projectId: string, userId?: string | null): string => {
  if (!userId) {
    return `${STORAGE_KEY_BASE}-project-${projectId}`; // Backward compatibility
  }
  return `${STORAGE_KEY_BASE}-user-${userId}-project-${projectId}`;
};
