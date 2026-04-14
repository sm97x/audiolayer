const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000";

const elements = {
  title: document.getElementById("title"),
  pageType: document.getElementById("pageType"),
  confidence: document.getElementById("confidence"),
  charCount: document.getElementById("charCount"),
  status: document.getElementById("status"),
  transcript: document.getElementById("transcript"),
  reasons: document.getElementById("reasons"),
  player: document.getElementById("player"),
  briefBtn: document.getElementById("briefBtn"),
  readBtn: document.getElementById("readBtn"),
  podcastBtn: document.getElementById("podcastBtn"),
};

const state = {
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
  tab: null,
  payload: null,
  analysis: null,
  objectUrl: null,
};

function setStatus(message) {
  elements.status.textContent = message;
}

function setBusy(isBusy) {
  [elements.briefBtn, elements.readBtn, elements.podcastBtn].forEach((button) => {
    button.disabled = isBusy || !state.analysis;
  });
}

function base64ToObjectUrl(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function getBackendBaseUrl() {
  const result = await chrome.storage.sync.get("backendBaseUrl");
  return result.backendBaseUrl || DEFAULT_BACKEND_BASE_URL;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getPagePayload(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "AUDIOLAYER_GET_PAGE" });
}

async function classifyPage() {
  if (!state.payload) {
    throw new Error("No page payload available.");
  }

  setStatus("Classifying page structure and cleaning content.");

  const response = await fetch(`${state.backendBaseUrl}/api/classify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(state.payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Classification failed.");
  }

  state.analysis = data;
  elements.title.textContent = data.title || state.payload.title || "Untitled page";
  elements.pageType.textContent = data.pageType;
  elements.confidence.textContent = data.confidence.toFixed(2);
  elements.charCount.textContent = data.cleanedCharCount.toLocaleString();
  elements.transcript.textContent = data.summaryPreview || "Transcript not available yet.";
  elements.reasons.textContent = `${data.reasons.join(" ")} ${data.debug.notes.join(" ")}`;
  setStatus("Ready. Choose a listening mode.");
  setBusy(false);
}

async function generate(mode) {
  if (!state.analysis) {
    return;
  }

  setBusy(true);
  setStatus(mode === "podcast" ? "Generating 2-host recap." : "Generating audio.");

  const endpoint = mode === "podcast" ? "/api/podcast" : "/api/tts";
  const response = await fetch(`${state.backendBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: state.analysis.title,
      url: state.payload.url,
      pageType: state.analysis.pageType,
      cleanedText: state.analysis.cleanedText,
      headings: state.analysis.headings,
      debug: state.analysis.debug,
      mode: mode === "podcast" ? undefined : mode,
      responseType: "json",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Audio generation failed.");
  }

  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  state.objectUrl = base64ToObjectUrl(data.audioBase64, data.mimeType);
  elements.player.src = state.objectUrl;
  elements.transcript.textContent = data.transcript || data.script || "No transcript returned.";
  setStatus("Audio ready.");
  setBusy(false);
}

async function initialize() {
  setBusy(true);
  state.backendBaseUrl = await getBackendBaseUrl();
  state.tab = await getActiveTab();

  if (!state.tab || !state.tab.id) {
    throw new Error("No active tab found.");
  }

  if (!state.tab.url || state.tab.url.startsWith("chrome://")) {
    throw new Error("AudioLayer cannot inspect Chrome internal pages.");
  }

  state.payload = await getPagePayload(state.tab.id);
  await classifyPage();
}

elements.briefBtn.addEventListener("click", () => {
  void generate("brief").catch((error) => {
    setStatus(error.message);
    setBusy(false);
  });
});

elements.readBtn.addEventListener("click", () => {
  void generate("read").catch((error) => {
    setStatus(error.message);
    setBusy(false);
  });
});

elements.podcastBtn.addEventListener("click", () => {
  void generate("podcast").catch((error) => {
    setStatus(error.message);
    setBusy(false);
  });
});

initialize().catch((error) => {
  setStatus(error.message || "Failed to initialize AudioLayer.");
  elements.title.textContent = "Unable to inspect this page";
  elements.reasons.textContent = "Check the backend URL in the extension options and try again.";
  setBusy(false);
});
