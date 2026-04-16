(function attachPopupState(global) {
  const MODES = ["brief", "read", "podcast"];

  function getModeStatus(mode) {
    if (mode === "brief") {
      return "Making summary...";
    }

    if (mode === "read") {
      return "Reading page...";
    }

    if (mode === "podcast") {
      return "Creating podcast recap...";
    }

    return "Ready";
  }

  function getButtonState(mode, loadingMode, hasAnalysis, activeMode) {
    return {
      disabled: !hasAnalysis || loadingMode !== null,
      isLoading: loadingMode === mode,
      isActive: loadingMode === mode || activeMode === mode,
    };
  }

  const api = {
    MODES,
    getModeStatus,
    getButtonState,
  };

  global.AudioLayerPopupState = api;

  if (typeof module !== "undefined") {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
