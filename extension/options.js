const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000";

const input = document.getElementById("backendBaseUrl");
const status = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");

async function restore() {
  const result = await chrome.storage.sync.get("backendBaseUrl");
  input.value = result.backendBaseUrl || DEFAULT_BACKEND_BASE_URL;
}

saveBtn.addEventListener("click", async () => {
  const value = input.value.trim() || DEFAULT_BACKEND_BASE_URL;
  await chrome.storage.sync.set({ backendBaseUrl: value });
  status.textContent = "Saved.";
});

restore();
