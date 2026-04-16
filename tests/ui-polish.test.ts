import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

describe("public UI polish", () => {
  it("uses AL branding in visible UI files", () => {
    const visibleFiles = [
      readProjectFile("app", "page.tsx"),
      readProjectFile("components", "hero-preview.tsx"),
      readProjectFile("extension", "popup.html"),
      readProjectFile("extension", "options.html"),
    ].join("\n");

    expect(visibleFiles).toContain("AL");
    expect(visibleFiles).not.toMatch(/>\s*SL\s*</);
  });

  it("does not expose internal metrics in the default UI", () => {
    const visibleFiles = [
      readProjectFile("components", "demo-console.tsx"),
      readProjectFile("components", "hero-preview.tsx"),
      readProjectFile("extension", "popup.html"),
    ].join("\n");

    expect(visibleFiles).not.toMatch(/>\s*Confidence\s*</i);
    expect(visibleFiles).not.toMatch(/Cleaned chars|Cleaned length|Top reason|Heuristics|Transcript \+ Debug/i);
  });

  it("clears demo playback and ignores stale sample requests", () => {
    const source = readProjectFile("components", "demo-console.tsx");

    expect(source).toContain("setTranscript(\"\")");
    expect(source).toContain("replaceAudioUrl(null)");
    expect(source).toContain("classifyRequestIdRef");
    expect(source).toContain("generationRequestIdRef");
  });
});
