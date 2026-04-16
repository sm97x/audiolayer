import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { cleanArticle } from "@/lib/extract/cleanArticle";
import { cleanDocs } from "@/lib/extract/cleanDocs";
import { cleanThread } from "@/lib/extract/cleanThread";
import { buildBriefTranscript, buildReadTranscript, summarizePage } from "@/lib/summarize";
import { BBC_INVESTIGATION_ARTICLE } from "./fixtures";

describe("summarizePage", () => {
  function countOccurrences(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length ?? 0;
  }

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
    expect(summary.whyThisMatters).toMatch(/main point|task|replies/i);
    expect(buildBriefTranscript(page, summary)).not.toMatch(/^Briefing on/i);
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
    expect(brief).not.toMatch(/Key takeaways|First,|Second,|Third,|Why this matters/i);
    expect(summary.takeaways[0]).not.toBe(page.title);
  });

  it("builds brief mode as a concise non-repeating article brief", () => {
    const page = cleanArticle({
      url: "https://example.com/sport/hugo-ekitike-injury",
      title: "Hugo Ekitike injury: France striker to miss World Cup, says Didier Deschamps",
      html: `
        <article>
          <h1>Hugo Ekitike injury: France striker to miss World Cup, says Didier Deschamps</h1>
          <p>France manager Didier Deschamps has confirmed striker Hugo Ekitike will miss the World Cup after suffering a suspected Achilles injury during Liverpool's Champions League defeat by Paris St-Germain on Tuesday.</p>
          <p>The France forward left the pitch at Anfield on a stretcher, and Liverpool fear a long absence for the 23-year-old, which could also rule him out of the start of next season.</p>
          <p>Ekitike went for scans on Wednesday, which are expected to confirm the extent of the damage.</p>
          <p>The severity of his injury will unfortunately prevent him from finishing the season with Liverpool and participating in the World Cup, confirmed Deschamps in a statement published by the French Football Federation.</p>
          <p>This injury is a huge blow for him, of course, but also for the France team.</p>
          <p>He made his France debut last September and was set to be part of Deschamps' squad for this summer's World Cup in the United States, Canada and Mexico.</p>
        </article>
      `,
    });
    const summary = summarizePage(page);
    const oldStyleBrief = [
      `Briefing on ${page.title}.`,
      summary.shortSummary,
      "Key takeaways.",
      summary.takeaways
        .map((takeaway, index) => `${index === 0 ? "First" : index === 1 ? "Second" : "Third"}, ${takeaway}`)
        .join(" "),
      summary.whyThisMatters,
    ].join(" ");
    const brief = buildBriefTranscript(page, summary);

    expect(brief).not.toMatch(/^Briefing on/i);
    expect(brief).not.toMatch(/Key takeaways|First,|Second,|Third,|Why this matters/i);
    expect(brief).toContain("Ekitike");
    expect(brief).toContain("World Cup");
    expect(brief).toMatch(/injury|Achilles/i);
    expect(brief).toMatch(/France|Liverpool/);
    expect(countOccurrences(brief, /will miss the World Cup/gi)).toBeLessThanOrEqual(1);
    expect(countOccurrences(brief, /participat(?:e|ing) in the World Cup/gi)).toBeLessThanOrEqual(1);
    expect(brief.length).toBeLessThan(oldStyleBrief.length * 0.65);
  });

  it("builds docs brief mode without repeated bullets or code narration", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "docs");
    if (!sample) {
      throw new Error("Missing docs sample.");
    }

    const page = cleanDocs({
      url: "https://demo.local/docs",
      html: sample.html,
      title: sample.title,
    });
    const brief = buildBriefTranscript(page, summarizePage(page));

    expect(brief).not.toMatch(/^Briefing on|Key takeaways|First,|Second,|Third,/i);
    expect(brief).toMatch(/render endpoint|audio/i);
    expect(brief).toMatch(/setup|request|constraints|task|path/i);
    expect(brief).not.toContain("Bullet:");
    expect(brief).not.toContain("Code example omitted from audio version.");
  });

  it("builds thread brief mode without timestamps or reply labels", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "thread");
    if (!sample) {
      throw new Error("Missing thread sample.");
    }

    const page = cleanThread({
      url: "https://demo.local/thread",
      html: sample.html,
      title: sample.title,
    });
    const brief = buildBriefTranscript(page, summarizePage(page));

    expect(brief).not.toMatch(/^Briefing on|Key takeaways|First,|Second,|Third,/i);
    expect(brief).toMatch(/bookmarking product docs|adaptive audio layer|docs/i);
    expect(brief).toMatch(/replies mainly focus|structure preserved|useful in practice|main point/i);
    expect(brief).not.toMatch(/\bReply\s+\d+\b/i);
    expect(brief).not.toMatch(/\b\d+\s+(minute|hour|day)s?\s+ago\b/i);
  });

  it("builds a longer investigative brief without media prompts or repeated facts", () => {
    const page = cleanArticle(BBC_INVESTIGATION_ARTICLE);
    const brief = buildBriefTranscript(page, summarizePage(page));
    const shortPage = cleanArticle({
      url: "https://example.com/short",
      title: "Council announces new library opening date",
      html: `
        <article>
          <h1>Council announces new library opening date</h1>
          <p>The council has announced that the new town library will open in June after a year of construction work.</p>
          <p>The building includes a children's reading room, study spaces, and a small cafe.</p>
        </article>
      `,
    });
    const shortBrief = buildBriefTranscript(shortPage, summarizePage(shortPage));

    expect(brief).not.toMatch(/Watch:|Media caption|Image caption|02:14|Published|Updated|ByBilly/i);
    expect(brief).toMatch(/shadow industry|law firms|advisers/i);
    expect(brief).toMatch(/undercover|reporters/i);
    expect(brief).toMatch(/fabricated evidence|fake cover stories|medical reports|photographs/i);
    expect(brief).toMatch(/Home Office|full force of the law|denied|response/i);
    expect(brief.length).toBeGreaterThan(shortBrief.length);
    expect(countOccurrences(brief, /shadow industry/gi)).toBeLessThanOrEqual(1);
  });

  it("builds read mode as article body narration without title, byline, timestamps, captions, or related links", () => {
    const page = cleanArticle({
      url: "https://www.bbc.co.uk/sport/football/example",
      title: "Hugo Ekitike injury: France striker to miss World Cup, says Didier Deschamps",
      html: `
        <article>
          <h1>Hugo Ekitike injury: France striker to miss World Cup, says Didier Deschamps</h1>
          <p class="byline">Aadam Patel</p>
          <p class="caption">Hugo Ekitike was forced off in the first half against Paris St-Germain</p>
          <ul>
            <li>Published 15 April 2026, 15:04 BST</li>
          </ul>
          <p>France manager Didier Deschamps has confirmed striker Hugo Ekitike will miss the World Cup after suffering a suspected Achilles injury during Liverpool's Champions League defeat by Paris St-Germain on Tuesday.</p>
          <p>The France forward left the pitch at Anfield on a stretcher, and Liverpool fear a long absence for the 23-year-old, which could also rule him out of the start of next season.</p>
          <blockquote>"Hugo suffered a serious injury on Tuesday evening against PSG. The severity of his injury will unfortunately prevent him from finishing the season with Liverpool and participating in the World Cup," confirmed Deschamps in a statement published by the French Football Federation.</blockquote>
          <p>Ekitike joined Liverpool from Eintracht Frankfurt last July and has been one of their standout performers in a difficult season for the club, with 17 goals and six assists in all competitions.</p>
          <p>Dembele double sends Liverpool crashing out of Champions League</p>
          <h2>'Huge blow for France and Liverpool'</h2>
          <p>It is a big blow for the French. I think Ekitike would have started for them on the left-hand side at the World Cup.</p>
        </article>
      `,
    });

    const readTranscript = buildReadTranscript(page);

    expect(readTranscript).not.toMatch(/^Read it mode/i);
    expect(readTranscript).not.toContain(page.title);
    expect(readTranscript).not.toMatch(/By Aadam Patel|Aadam Patel/);
    expect(readTranscript).not.toMatch(/Published|Bullet: Published/);
    expect(readTranscript).not.toMatch(/forced off in the first half/i);
    expect(readTranscript).not.toMatch(/Dembele double sends/i);
    expect(readTranscript).toContain("France manager Didier Deschamps has confirmed striker Hugo Ekitike");
    expect(readTranscript).toContain("Hugo suffered a serious injury");
    expect(readTranscript).toContain("'Huge blow for France and Liverpool'");
  });

  it("builds investigative read mode without media captions and duplicate bullets", () => {
    const page = cleanArticle(BBC_INVESTIGATION_ARTICLE);
    const readTranscript = buildReadTranscript(page);

    expect(readTranscript).not.toMatch(/Watch:|Media caption|Image caption|02:14|Published|Updated|ByBilly/i);
    expect(readTranscript).toContain("A shadow industry of law firms and advisers");
    expect(readTranscript).toContain("'Nobody is gay here'");
    expect(readTranscript).toContain("'A comprehensive package'");
    expect(readTranscript).toContain("One law firm charged up to \u00a37,000");
    expect(countOccurrences(readTranscript, /One law firm charged up to \u00a37,000/gi)).toBe(1);
    expect(countOccurrences(readTranscript, /Fake asylum seekers visited GPs/gi)).toBe(1);
  });

  it("keeps documentation structure in read mode without a mode announcement", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "docs");
    if (!sample) {
      throw new Error("Missing docs sample.");
    }

    const page = cleanDocs({
      url: "https://demo.local/docs",
      html: sample.html,
      title: sample.title,
    });
    const readTranscript = buildReadTranscript(page);

    expect(readTranscript).not.toMatch(/^Read it mode/i);
    expect(readTranscript).toContain("Before you start");
    expect(readTranscript).toContain("Bullet: Create an API key in the dashboard.");
    expect(readTranscript).toContain("Code example omitted from audio version.");
  });

  it("keeps thread content in read mode but strips reply timestamps", () => {
    const sample = DEMO_SAMPLES.find((entry) => entry.id === "thread");
    if (!sample) {
      throw new Error("Missing thread sample.");
    }

    const page = cleanThread({
      url: "https://demo.local/thread",
      html: sample.html,
      title: sample.title,
    });
    const readTranscript = buildReadTranscript(page);

    expect(readTranscript).not.toMatch(/^Read it mode/i);
    expect(readTranscript).toContain("Original post.");
    expect(readTranscript).toContain("Top replies.");
    expect(readTranscript).toContain("Reply 1.");
    expect(readTranscript).not.toMatch(/\b\d+\s+(minute|hour|day)s?\s+ago\b/i);
  });
});
