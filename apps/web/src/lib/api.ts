const PROD_API_URL = 'https://plant-transit-api.rangtaali2026.workers.dev';

// Ensure we never resolve to an empty base or local relative path in production
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL !== ''
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : PROD_API_URL;

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const cleanBase = API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${cleanBase}${cleanPath}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API responded with invalid non-JSON content (${response.status}): ${text.slice(0, 150)}...`);
  }

  if (!response.ok) {
    throw new Error(data.error || `API request failed with status ${response.status}`);
  }

  return data as T;
}
