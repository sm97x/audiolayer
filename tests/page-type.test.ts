import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { classifyPage } from "@/lib/page-type";

describe("classifyPage", () => {
  it("detects article pages", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "article");
    if (!sample) {
      throw new Error("Missing article sample.");
    }

    const result = classifyPage({
      url: "https://demo.local/article",
      html: sample.html,
      title: sample.title,
    });

    expect(result.pageType).toBe("article");
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("detects docs pages", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "docs");
    if (!sample) {
      throw new Error("Missing docs sample.");
    }

    const result = classifyPage({
      url: "https://demo.local/docs",
      html: sample.html,
      title: sample.title,
    });

    expect(result.pageType).toBe("docs");
    expect(result.reasons.join(" ")).toMatch(/heading|code|sidebar/i);
  });

  it("detects thread pages", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "thread");
    if (!sample) {
      throw new Error("Missing thread sample.");
    }

    const result = classifyPage({
      url: "https://demo.local/thread",
      html: sample.html,
      title: sample.title,
    });

    expect(result.pageType).toBe("thread");
    expect(result.metrics.commentBlockCount).toBeGreaterThan(0);
  });

  it("does not confuse news article metadata with a thread", () => {
    const result = classifyPage({
      url: "https://www.bbc.co.uk/news/example",
      title: "BBC to cut almost one in 10 staff in 500 million pounds savings",
      html: `
        <main>
          <article>
            <h1>BBC to cut almost one in 10 staff in 500 million pounds savings</h1>
            <p>Published15 April 2026, 16:39 BST</p>
            <p>The BBC has announced it will cut between 1,800 and 2,000 jobs in an attempt to tackle significant financial pressures.</p>
            <p>The broadcaster needs to make 500 million pounds savings over the next two years, and interim director general Rhodri Talfan Davies did not rule out axing entire channels or services.</p>
            <p>The plans are expected to affect several divisions as leadership tries to reshape the organisation for a smaller licence-fee settlement.</p>
            <section class="comments-promo">Join the conversation about this story</section>
          </article>
        </main>
      `,
    });

    expect(result.pageType).toBe("article");
  });
});
