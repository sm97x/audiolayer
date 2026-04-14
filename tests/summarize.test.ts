import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { cleanArticle } from "@/lib/extract/cleanArticle";
import { buildBriefTranscript, summarizePage } from "@/lib/summarize";

describe("summarizePage", () => {
  it("returns a spoken summary structure", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "article");
    if (!sample) {
      throw new Error("Missing article sample.");
    }

    const page = cleanArticle({
      url: "https://demo.local/article",
      html: sample.html,
      title: sample.title,
    });

    const summary = summarizePage(page);

    expect(summary.shortSummary.length).toBeGreaterThan(60);
    expect(summary.takeaways).toHaveLength(3);
    expect(summary.whyThisMatters).toMatch(/Why this matters:/);
    expect(buildBriefTranscript(page, summary)).toMatch(/Briefing on/i);
  });

  it("does not promote title-only or timestamp metadata lines into the brief", () => {
    const page = cleanArticle({
      url: "https://www.bbc.co.uk/news/example",
      title: "BBC to cut almost one in 10 staff in 500 million pounds savings",
      html: `
        <article>
          <h1>BBC to cut almost one in 10 staff in 500 million pounds savings</h1>
          <p>Published15 April 2026, 16:39 BST</p>
          <p>The BBC has announced it will cut between 1,800 and 2,000 jobs in an attempt to tackle significant financial pressures.</p>
          <p>The broadcaster needs to make 500 million pounds savings over the next two years, and interim director general Rhodri Talfan Davies did not rule out axing entire channels or services.</p>
          <p>Leadership said the savings programme is designed to protect distinctive journalism while reducing duplicated work across teams.</p>
        </article>
      `,
    });

    const summary = summarizePage(page);
    const brief = buildBriefTranscript(page, summary);

    expect(brief).not.toMatch(/Published15/);
    expect(summary.takeaways[0]).not.toBe(page.title);
  });
});
