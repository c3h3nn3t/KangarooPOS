export { ApiClient } from './client';
export * from './types';

// Create a default instance for convenience
import { ApiClient } from './client';

let defaultClient: ApiClient | null = null;

export function initializeApiClient(baseUrl: string, token?: string): ApiClient {
  defaultClient = new ApiClient({ baseUrl, token });
  return defaultClient;
}

export function getApiClient(): ApiClient {
  if (!defaultClient) {
    throw new Error('API client not initialized. Call initializeApiClient first.');
  }
  return defaultClient;
}
