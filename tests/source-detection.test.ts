import { describe, expect, it } from "vitest";
import { detectSourceHints } from "@/lib/source-detection";

describe("detectSourceHints", () => {
  it.each([
    [
      "https://www.reddit.com/r/webdev/comments/abc123/how_do_people_use_audio_for_docs/",
      "reddit",
      "thread",
      "html",
    ],
    ["https://old.reddit.com/r/webdev/comments/abc123/example/", "reddit", "thread", "html"],
    ["https://x.com/example/status/1234567890", "x", "thread", "html"],
    ["https://twitter.com/example/status/1234567890", "x", "thread", "html"],
    ["https://news.ycombinator.com/item?id=41234567", "hackernews", "thread", "html"],
    ["https://github.com/acme/app/issues/42", "github", "thread", "html"],
    ["https://github.com/acme/app/discussions/87", "github", "thread", "html"],
    ["https://stackoverflow.com/questions/12345/how-to-stream-audio", "stackoverflow", "thread", "html"],
    ["https://example.com/manuals/audio-layer.pdf", "generic", "docs", "pdf"],
  ])("uses URL priors for %s", (url, hostFamily, pageIntentHint, sourceKind) => {
    const hints = detectSourceHints({ url, title: "Example page", html: "<main>Example page</main>" });

    expect(hints).toMatchObject({
      hostFamily,
      pageIntentHint,
      sourceKind,
    });
  });

  it("keeps selected text length as an ingestion hint", () => {
    const selectedText = "This is selected text from a dense article. ".repeat(5);
    const hints = detectSourceHints({
      url: "https://example.com/story",
      title: "Story",
      html: "<article><h1>Story</h1><p>Body text.</p></article>",
      selectedText,
    });

    expect(hints.selectedTextLength).toBe(selectedText.trim().length);
  });
});
