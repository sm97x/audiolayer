const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000";

const modeHelpers = window.AudioLayerPopupState;

const elements = {
  title: document.getElementById("title"),
  pageType: document.getElementById("pageType"),
  status: document.getElementById("status"),
  transcript: document.getElementById("transcript"),
  developerDetails: document.getElementById("developerDetails"),
  player: document.getElementById("player"),
  emptyState: document.getElementById("emptyState"),
  errorCard: document.getElementById("errorCard"),
  errorMessage: document.getElementById("errorMessage"),
  settingsBtn: document.getElementById("settingsBtn"),
  buttonGrid: document.querySelector(".button-grid"),
  briefBtn: document.getElementById("briefBtn"),
  readBtn: document.getElementById("readBtn"),
  podcastBtn: document.getElementById("podcastBtn"),
};

const buttonsByMode = {
  brief: elements.briefBtn,
  read: elements.readBtn,
  podcast: elements.podcastBtn,
};

const state = {
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
  tab: null,
  payload: null,
  analysis: null,
  objectUrl: null,
  loadingMode: null,
};

function setStatus(message) {
  elements.status.textContent = message;
}

function hideError() {
  elements.errorCard.hidden = true;
  elements.errorMessage.textContent = "";
}

function showError(message, showSettings = true) {
  elements.errorMessage.textContent = message;
  elements.errorCard.hidden = false;
  elements.settingsBtn.hidden = !showSettings;
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (/failed to fetch|networkerror|load failed|could not fetch/i.test(message)) {
    return "Could not reach the app. Check settings and make sure the dev server is running.";
  }

  if (/receiving end does not exist|no page payload|cannot inspect|chrome internal/i.test(message)) {
    return "This page cannot be inspected. Try a normal article, docs page, or thread.";
  }

  return message || "Something went wrong.";
}

function renderButtons() {
  const hasAnalysis = Boolean(state.analysis);
  elements.buttonGrid.setAttribute("aria-busy", state.loadingMode ? "true" : "false");

  modeHelpers.MODES.forEach((mode) => {
    const button = buttonsByMode[mode];
    const buttonState = modeHelpers.getButtonState(mode, state.loadingMode, hasAnalysis);

    button.disabled = buttonState.disabled;
    button.classList.toggle("is-loading", buttonState.isLoading);
    button.setAttribute("aria-busy", buttonState.isLoading ? "true" : "false");
  });
}

function setLoadingMode(mode) {
  state.loadingMode = mode;
  renderButtons();
}

function clearAudio() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  elements.player.removeAttribute("src");
  elements.player.hidden = true;
  elements.emptyState.hidden = false;
  elements.player.load();
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

function renderAnalysis(data) {
  const extractionNotes = data.debug?.extraction?.notes ?? [];
  const classifierNotes = data.debug?.reasons ?? [];
  const notes = [data.whyThisMatters, ...classifierNotes, ...extractionNotes].filter(Boolean);

  state.analysis = data;
  elements.title.textContent = data.title || state.payload.title || "Untitled page";
  elements.pageType.textContent = data.pageType || "page";
  elements.transcript.textContent = data.summaryPreview || "Choose a mode to hear this page.";
  elements.developerDetails.textContent = notes.join(" ") || "No extra details returned.";
  setStatus("Ready");
  renderButtons();
}

async function classifyPage() {
  if (!state.payload) {
    throw new Error("No page payload available.");
  }

  setStatus("Checking page...");
  hideError();

  const response = await fetch(`${state.backendBaseUrl}/api/classify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...state.payload,
      includeDebug: true,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "This page could not be prepared.");
  }

  renderAnalysis(data);
}

async function generate(mode) {
  if (!state.analysis || state.loadingMode) {
    return;
  }

  setLoadingMode(mode);
  hideError();
  clearAudio();
  setStatus(modeHelpers.getModeStatus(mode));
  elements.transcript.textContent = "Preparing audio...";

  try {
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
        debug: state.analysis.debug?.extraction,
        mode: mode === "podcast" ? undefined : mode,
        responseType: "json",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Audio could not be generated.");
    }

    state.objectUrl = base64ToObjectUrl(data.audioBase64, data.mimeType);
    elements.player.src = state.objectUrl;
    elements.player.hidden = false;
    elements.emptyState.hidden = true;
    elements.transcript.textContent = data.transcript || data.script || "No transcript returned.";
    setStatus("Audio ready");
  } catch (error) {
    const message = friendlyError(error);
    elements.transcript.textContent = "The transcript will appear here after you choose a mode.";
    showError(message);
    setStatus("Could not create audio");
  } finally {
    setLoadingMode(null);
  }
}

async function initialize() {
  renderButtons();
  clearAudio();
  setStatus("Checking page...");
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
  void generate("brief");
});

elements.readBtn.addEventListener("click", () => {
  void generate("read");
});

elements.podcastBtn.addEventListener("click", () => {
  void generate("podcast");
});

elements.settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

initialize().catch((error) => {
  const message = friendlyError(error);
  elements.title.textContent = "Unable to inspect this page";
  elements.pageType.textContent = "Unavailable";
  elements.transcript.textContent = "The transcript will appear here after you choose a mode.";
  elements.developerDetails.textContent = message;
  showError(message);
  setStatus("Could not prepare page");
  state.analysis = null;
  setLoadingMode(null);
});
