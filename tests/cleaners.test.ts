import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { cleanArticle } from "@/lib/extract/cleanArticle";
import { cleanDocs } from "@/lib/extract/cleanDocs";
import { cleanThread } from "@/lib/extract/cleanThread";

describe("cleaners", () => {
  it("article cleaner keeps the body and removes footer fluff", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "article");
    if (!sample) {
      throw new Error("Missing article sample.");
    }

    const cleaned = cleanArticle({
      url: "https://demo.local/article",
      html: sample.html,
      title: sample.title,
    });

    expect(cleaned.cleanedText).toContain(sample.title);
    expect(cleaned.cleanedText).not.toMatch(/newsletter signup/i);
    expect(cleaned.debug.removedCount).toBeGreaterThan(0);
  });

  it("docs cleaner replaces code blocks with spoken placeholders", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "docs");
    if (!sample) {
      throw new Error("Missing docs sample.");
    }

    const cleaned = cleanDocs({
      url: "https://demo.local/docs",
      html: sample.html,
      title: sample.title,
    });

    expect(cleaned.cleanedText).toContain("Code example omitted from audio version.");
    expect(cleaned.cleanedText).not.toContain("POST /v1/render");
  });

  it("thread cleaner keeps the original post and top replies", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "thread");
    if (!sample) {
      throw new Error("Missing thread sample.");
    }

    const cleaned = cleanThread({
      url: "https://demo.local/thread",
      html: sample.html,
      title: sample.title,
    });

    expect(cleaned.cleanedText).toContain("Original post.");
    expect(cleaned.cleanedText).toContain("Top replies.");
    expect(cleaned.cleanedText).not.toMatch(/recommended users/i);
  });
});
