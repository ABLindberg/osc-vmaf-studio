const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const getApiUrl = (endpoint: string): string => {
  return `${API_BASE_URL}/api${endpoint}`;
};

export const apiRequest = async (endpoint: string, options?: RequestInit): Promise<Response> => {
  return fetch(getApiUrl(endpoint), options);
};