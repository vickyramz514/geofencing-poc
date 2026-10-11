import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      const value = values.get(key);
      return value === undefined ? null : value;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

export const asyncStorageAdapter: KeyValueStorage = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
};
