import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { getDemoButtonState } from "@/components/demo-console";

function loadPopupStateHelpers() {
  const code = fs.readFileSync(path.join(process.cwd(), "extension", "popup-state.js"), "utf8");
  const sandbox = {
    module: { exports: {} },
    window: {},
    globalThis: {},
  };

  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports as {
    getButtonState: (
      mode: "brief" | "read" | "podcast",
      loadingMode: "brief" | "read" | "podcast" | null,
      hasAnalysis: boolean,
    ) => { disabled: boolean; isLoading: boolean };
  };
}

describe("loading state helpers", () => {
  it("marks only the clicked demo button as loading", () => {
    expect(getDemoButtonState("read", "read", true)).toEqual({
      disabled: true,
      isLoading: true,
    });
    expect(getDemoButtonState("brief", "read", true)).toEqual({
      disabled: true,
      isLoading: false,
    });
  });

  it("disables demo buttons until the page is ready", () => {
    expect(getDemoButtonState("brief", null, false)).toEqual({
      disabled: true,
      isLoading: false,
    });
  });

  it("uses the same per-mode behavior in the extension popup", () => {
    const helpers = loadPopupStateHelpers();

    expect(helpers.getButtonState("podcast", "podcast", true)).toEqual({
      disabled: true,
      isLoading: true,
    });
    expect(helpers.getButtonState("brief", "podcast", true)).toEqual({
      disabled: true,
      isLoading: false,
    });
  });
});
