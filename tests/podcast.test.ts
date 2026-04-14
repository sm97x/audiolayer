import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { cleanThread } from "@/lib/extract/cleanThread";
import { createPodcastScript } from "@/lib/podcastScript";
import { summarizePage } from "@/lib/summarize";

describe("createPodcastScript", () => {
  it("builds a short two-host dialogue", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "thread");
    if (!sample) {
      throw new Error("Missing thread sample.");
    }

    const page = cleanThread({
      url: "https://demo.local/thread",
      html: sample.html,
      title: sample.title,
    });

    const summary = summarizePage(page);
    const script = createPodcastScript(page, summary);

    expect(script.turns.length).toBeGreaterThanOrEqual(6);
    expect(script.script).toContain("Host A:");
    expect(script.script).toContain("Host B:");
  });
});
