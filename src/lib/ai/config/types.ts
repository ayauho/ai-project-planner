
export interface ApiKeyConfig {
  storageKey: string;
  encryptionKey: string;
  validationEndpoint?: string;
  provider: 'openai';
}

export interface ApiKeyValidator {
  validateKey(key: string): Promise<boolean>;
}

export interface ApiKeyStorage {
  storeKey(key: string): Promise<void>;
  getKey(): Promise<string | null>;
  removeKey(): Promise<void>;
}

export interface ApiKeyManager {
  getKey(): Promise<string | null>;
  setKey(key: string): Promise<void>;
  validateKey(key: string): Promise<boolean>;
  removeKey(): Promise<void>;
}
