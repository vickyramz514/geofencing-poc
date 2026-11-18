import {API_BASE_URL, USE_MOCK_API} from '@env';
import {Platform} from 'react-native';

export interface AppEnvironment {
  apiBaseUrl: string;
  useMockApi: boolean;
}

function readString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function localApiHostForPlatform(url: string): string {
  if (Platform.OS === 'ios') {
    return url.replace(/(https?:\/\/)10\.0\.2\.2(?=[:/]|$)/i, (_match, scheme: string) => `${scheme}localhost`);
  }
  if (Platform.OS === 'android') {
    return url.replace(/(https?:\/\/)localhost(?=[:/]|$)/i, (_match, scheme: string) => `${scheme}10.0.2.2`);
  }
  return url;
}

export function resolveEnvironment(
  source: {apiBaseUrl?: string; useMockApi?: string} = {},
): AppEnvironment {
  const configuredApiBaseUrl = readString(
    source.apiBaseUrl !== undefined ? source.apiBaseUrl : API_BASE_URL,
  );
  const apiBaseUrl = localApiHostForPlatform(configuredApiBaseUrl);
  const mockFlag = readString(
    source.useMockApi !== undefined ? source.useMockApi : USE_MOCK_API,
  );
  const mockRequested = mockFlag === '' || mockFlag.toLowerCase() === 'true';
  return {
    apiBaseUrl,
    useMockApi: mockRequested || apiBaseUrl.length === 0,
  };
}
