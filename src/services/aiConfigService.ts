const GEMINI_KEY_STORAGE_KEY = 'nrfinance_custom_gemini_key';

export function getCustomGeminiKey(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(GEMINI_KEY_STORAGE_KEY) || '';
    }
  } catch {
    // Ignora erro
  }
  return '';
}

export function setCustomGeminiKey(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (key) {
        window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, key.trim());
      } else {
        window.localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
      }
    }
  } catch {
    // Ignora erro
  }
}
