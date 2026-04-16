const DEFAULT_BACKEND_BASE_URL = "https://audiolayer-delta.vercel.app";

const input = document.getElementById("backendBaseUrl");
const status = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");

function normalizeBackendUrl(value) {
  const rawValue = value.trim() || DEFAULT_BACKEND_BASE_URL;
  const url = new URL(rawValue);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Use an http or https URL.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function restore() {
  const result = await chrome.storage.sync.get("backendBaseUrl");
  input.value = result.backendBaseUrl || DEFAULT_BACKEND_BASE_URL;
}

saveBtn.addEventListener("click", async () => {
  try {
    const backendBaseUrl = normalizeBackendUrl(input.value);
    await chrome.storage.sync.set({ backendBaseUrl });
    input.value = backendBaseUrl;
    setStatus("Settings saved.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Enter a valid backend URL.", true);
  }
});

restore().catch(() => {
  input.value = DEFAULT_BACKEND_BASE_URL;
  setStatus("Using the default AudioLayer app.");
});
