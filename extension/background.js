const DEFAULT_BACKEND_BASE_URL = "https://audiolayer-delta.vercel.app";

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get("backendBaseUrl");

  if (!current.backendBaseUrl) {
    await chrome.storage.sync.set({
      backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
    });
  }
});
