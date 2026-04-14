import { describe, expect, it } from "vitest";
import { normalizeForSpeech } from "@/lib/ttsNormalize";

describe("normalizeForSpeech", () => {
  it("expands dates, ordinals, percentages, and currency", () => {
    const normalized = normalizeForSpeech(
      "Launch is Jan 5th 2026. Growth hit 42% and revenue reached $12.50. Savings were \u00a3500m.",
    );

    expect(normalized).toContain("January fifth, 2026");
    expect(normalized).toContain("42 percent");
    expect(normalized).toContain("12 dollars and 50 cents");
    expect(normalized).toContain("500 million pounds");
  });

  it("protects URLs and backticked code", () => {
    const normalized = normalizeForSpeech(
      "See https://example.com and `renderAudio()` on the 21st.",
      { pageType: "docs" },
    );

    expect(normalized).toContain("https://example.com");
    expect(normalized).toContain("`renderAudio()`");
    expect(normalized).toContain("twenty-first");
  });
});
