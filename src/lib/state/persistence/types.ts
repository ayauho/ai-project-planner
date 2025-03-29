/**
 * Types and interfaces for data persistence layer
 */

export interface StorageItem {
  key: string;
  value: unknown;
  timestamp: number;
}

export interface StorageManager {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface DatabaseSync {
  syncToDb(item: StorageItem): Promise<void>;
  syncFromDb(key: string): Promise<StorageItem | null>;
  validateSync(key: string): Promise<boolean>;
}

export type StorageEncryption = {
  encrypt(value: unknown): string;
  decrypt(value: string): unknown;
};
