import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.geofencepoc.auth';

export interface SecureStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

/**
 * Authentication tokens stay in the platform keychain.
 * The offline queue uses AsyncStorage and must never receive a token.
 */
export const keychainSecureStorage: SecureStorage = {
  async getToken() {
    const credentials = await Keychain.getGenericPassword({service: SERVICE});
    if (!credentials) {
      return null;
    }
    return credentials.password;
  },
  async setToken(token) {
    await Keychain.setGenericPassword('api', token, {service: SERVICE});
  },
  async clearToken() {
    await Keychain.resetGenericPassword({service: SERVICE});
  },
};
