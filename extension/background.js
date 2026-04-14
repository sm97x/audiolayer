const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000";

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get("backendBaseUrl");

  if (!current.backendBaseUrl) {
    await chrome.storage.sync.set({
      backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
    });
  }
});
