export const REQUIRED_ORIGINS = ["https://api.typesafe.ai/*", "https://mail.google.com/*"];

export async function hasRequiredOrigins(): Promise<boolean> {
  if (!chrome.permissions) return true;
  return chrome.permissions.contains({ origins: REQUIRED_ORIGINS });
}

export async function requestRequiredOrigins(): Promise<boolean> {
  if (!chrome.permissions) return true;
  return chrome.permissions.request({ origins: REQUIRED_ORIGINS });
}
