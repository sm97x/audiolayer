import { describe, expect, it } from "vitest";
import { cleanThread } from "@/lib/extract/cleanThread";
import { classifyPage } from "@/lib/page-type";
import { createPodcastScript } from "@/lib/podcastScript";
import { buildBriefTranscript, buildReadTranscript, summarizePage } from "@/lib/summarize";

const REDDIT_THREAD_HTML = `
  <main>
    <shreddit-post>
      <h1>How are people using audio for long documentation?</h1>
      <div slot="text-body">
        <p>I keep bookmarking product docs but never get through them. I want an audio version that keeps the main point, setup steps, and caveats without reading every code line.</p>
      </div>
    </shreddit-post>
    <shreddit-comment data-depth="0">
      <p>I would use it for commutes, especially if it preserves headings and tells me when a code example needs the screen.</p>
    </shreddit-comment>
    <shreddit-comment data-depth="0">
      <p>The main risk is trust. It needs to be accurate and should not invent details when the page is ambiguous.</p>
    </shreddit-comment>
    <shreddit-comment data-depth="0">
      <p>Good summaries are useful, but the product should also keep structure so I can jump back into the original docs later.</p>
    </shreddit-comment>
    <shreddit-comment data-depth="0">
      <p>Good summaries are useful, but the product should also keep structure so I can jump back into the original docs later.</p>
    </shreddit-comment>
  </main>
`;

function hostBTurns(script: string): string[] {
  return script
    .split("\n")
    .filter((line) => line.startsWith("Host B:"))
    .map((line) => line.replace(/^Host B:\s*/, ""));
}

describe("thread source handling", () => {
  it("uses site priors so Reddit, Hacker News, GitHub, Stack Overflow, and X classify as threads", () => {
    const cases = [
      {
        url: "https://www.reddit.com/r/productivity/comments/abc123/how_do_people_use_audio/",
        html: REDDIT_THREAD_HTML,
      },
      {
        url: "https://news.ycombinator.com/item?id=41234567",
        html: "<table><tr class='athing comtr'><td class='comment'><span class='commtext'>This is a thoughtful reply about the tradeoff.</span></td></tr></table>",
      },
      {
        url: "https://github.com/acme/audiolayer/issues/42",
        html: "<main><h1 class='js-issue-title'>Support better thread reading</h1><div class='js-issue-body'><p>The popup should preserve comments and the issue body.</p></div><div class='js-comment-container'><div class='comment-body'>A reply adds the expected behavior and edge case.</div></div></main>",
      },
      {
        url: "https://stackoverflow.com/questions/12345/how-to-stream-mp3-from-nextjs",
        html: "<main><div id='question'><div class='s-prose'>How do I stream generated audio from a Next.js route?</div></div><div class='answer'><div class='s-prose'>Use a response with the right content type and avoid buffering too much.</div></div></main>",
      },
      {
        url: "https://x.com/example/status/1234567890",
        html: "<main><article data-testid='tweet'><div data-testid='tweetText'>Audio summaries need a clear source link and a short transcript.</div></article><article data-testid='tweet'><div data-testid='tweetText'>The reply adds that threads need context, not just one post.</div></article></main>",
      },
    ];

    cases.forEach((fixture) => {
      const result = classifyPage({
        ...fixture,
        title: "Thread fixture",
      });

      expect(result.pageType).toBe("thread");
      expect(result.sourceHints.pageIntentHint).toBe("thread");
    });
  });

  it("extracts a Reddit thread model and keeps single-voice thread modes intentional", () => {
    const page = cleanThread({
      url: "https://www.reddit.com/r/productivity/comments/abc123/how_do_people_use_audio/",
      title: "How are people using audio for long documentation?",
      html: REDDIT_THREAD_HTML,
    });

    const summary = summarizePage(page);
    const brief = buildBriefTranscript(page, summary);
    const read = buildReadTranscript(page);

    expect(page.threadModel?.originalPost?.text).toMatch(/bookmarking product docs/i);
    expect(page.threadModel?.replies).toHaveLength(3);
    expect(page.threadModel?.themes?.join(" ")).toMatch(/structure|trust|useful/i);

    expect(brief).toMatch(/original post/i);
    expect(brief).toMatch(/replies mainly focus/i);
    expect(brief).not.toMatch(/\b\d+\s+(minute|hour|day)s?\s+ago\b/i);

    expect(read).toContain("Original post.");
    expect(read).toContain("Top replies.");
    expect(read).toContain("Reply 1.");
    expect(read).toContain("Common theme in the replies:");
  });

  it("creates a thread podcast with varied co-host questions and no repeated original-post turn", () => {
    const page = cleanThread({
      url: "https://www.reddit.com/r/productivity/comments/abc123/how_do_people_use_audio/",
      title: "How are people using audio for long documentation?",
      html: REDDIT_THREAD_HTML,
    });
    const script = createPodcastScript(page, summarizePage(page));
    const hostB = hostBTurns(script.script);

    expect(script.turns.length).toBeGreaterThanOrEqual(7);
    expect(new Set(hostB).size).toBe(hostB.length);
    expect(script.turns[0]?.text).toMatch(/thread about/i);
    expect(script.turns[2]?.text).not.toBe(script.turns[0]?.text);
    expect(script.script).not.toMatch(/What is the core thing to know|What should I actually remember/i);
  });
});
