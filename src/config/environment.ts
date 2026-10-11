import {API_BASE_URL, USE_MOCK_API} from '@env';

export interface AppEnvironment {
  apiBaseUrl: string;
  useMockApi: boolean;
}

function readString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveEnvironment(
  source: {apiBaseUrl?: string; useMockApi?: string} = {},
): AppEnvironment {
  const apiBaseUrl = readString(
    source.apiBaseUrl !== undefined ? source.apiBaseUrl : API_BASE_URL,
  );
  const mockFlag = readString(
    source.useMockApi !== undefined ? source.useMockApi : USE_MOCK_API,
  );
  const mockRequested = mockFlag === '' || mockFlag.toLowerCase() === 'true';
  return {
    apiBaseUrl,
    useMockApi: mockRequested || apiBaseUrl.length === 0,
  };
}
