import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { cleanArticle } from "@/lib/extract/cleanArticle";
import { cleanThread } from "@/lib/extract/cleanThread";
import { createPodcastScript } from "@/lib/podcastScript";
import { summarizePage } from "@/lib/summarize";
import { BBC_INVESTIGATION_ARTICLE } from "./fixtures";

describe("createPodcastScript", () => {
  const bannedPodcastPhrases = [
    "AudioLayer",
    "navigation chrome",
    "page furniture",
    "human version",
    "useful version",
    "what should we not overdo",
    "talk me through it like",
    "What did AudioLayer intentionally leave out",
    "skip the surrounding",
    "The takeaway is",
    "Watch:",
    "Media caption",
    "Image caption",
  ];

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

  it("turns a sports injury article into a natural conversation without product meta-language", () => {
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
          <p>Ekitike joined Liverpool from Eintracht Frankfurt last July and has been one of their standout performers in a difficult season for the club, with 17 goals and six assists in all competitions.</p>
          <p>He made his France debut last September and was set to be part of Deschamps' squad for this summer's World Cup in the United States, Canada and Mexico.</p>
        </article>
      `,
    });
    const summary = summarizePage(page);
    const script = createPodcastScript(page, summary);

    expect(script.turns.length).toBeGreaterThanOrEqual(7);
    bannedPodcastPhrases.forEach((phrase) => {
      expect(script.script).not.toContain(phrase);
    });

    expect(script.script).not.toContain("Hugo Ekitike injury:");
    expect(script.script).not.toContain("expected to finishing");
    expect(script.script).toContain("Hugo Ekitike");
    expect(script.script).toContain("World Cup");
    expect(script.script).toContain("Liverpool");
    expect(script.script).toMatch(/Achilles|injury/i);
    expect(script.script).toContain("France");
    expect(script.script).toMatch(/scan|timeline|unclear|next/i);
  });

  it("keeps non-sports article podcasts scalable and free of debug language", () => {
    const page = cleanArticle({
      url: "https://example.com/business/atlas-studios-cuts",
      title: "Atlas Studios to cut 900 jobs as streaming losses mount",
      html: `
        <article>
          <h1>Atlas Studios to cut 900 jobs as streaming losses mount</h1>
          <p>Atlas Studios announced it will cut 900 jobs after a difficult year for its streaming division and a slower advertising market.</p>
          <p>The company said the reductions are part of a 300 million pound savings plan designed to protect film production and its core subscription products.</p>
          <p>Executives did not rule out closing smaller regional teams if market conditions fail to improve by the end of the year.</p>
          <p>Analysts said the move shows how entertainment companies are shifting from subscriber growth at any cost to tighter control over spending.</p>
        </article>
      `,
    });
    const summary = summarizePage(page);
    const script = createPodcastScript(page, summary);

    bannedPodcastPhrases.forEach((phrase) => {
      expect(script.script).not.toContain(phrase);
    });

    expect(script.script).toContain("Atlas Studios");
    expect(script.script).toMatch(/900 jobs|jobs/i);
    expect(script.script).toMatch(/pressure|financial|savings|cost/i);
    expect(script.script).toMatch(/next|review|conditions|leave|keep in mind/i);
  });

  it("creates a deeper investigation podcast without media prompts or weak subject extraction", () => {
    const longPage = cleanArticle(BBC_INVESTIGATION_ARTICLE);
    const longScript = createPodcastScript(longPage, summarizePage(longPage));
    const shortPage = cleanArticle({
      url: "https://example.com/business/atlas-studios-cuts",
      title: "Atlas Studios to cut 900 jobs as streaming losses mount",
      html: `
        <article>
          <h1>Atlas Studios to cut 900 jobs as streaming losses mount</h1>
          <p>Atlas Studios announced it will cut 900 jobs after a difficult year for its streaming division and a slower advertising market.</p>
          <p>The company said the reductions are part of a 300 million pound savings plan designed to protect film production and its core subscription products.</p>
          <p>Executives did not rule out closing smaller regional teams if market conditions fail to improve by the end of the year.</p>
        </article>
      `,
    });
    const shortScript = createPodcastScript(shortPage, summarizePage(shortPage));

    bannedPodcastPhrases.forEach((phrase) => {
      expect(longScript.script).not.toContain(phrase);
    });

    expect(longScript.script).not.toMatch(/about Legal[.,]/i);
    expect(longScript.script).toMatch(/legal advisers|asylum claims|fake asylum/i);
    expect(longScript.script).toMatch(/undercover|reporters/i);
    expect(longScript.script).toMatch(/fabricated evidence|supporting material|fake/i);
    expect(longScript.script).toMatch(/Home Office|official response|regulators/i);
    expect(longScript.turns.length).toBeGreaterThan(shortScript.turns.length);
    expect(longScript.turns.length).toBeGreaterThanOrEqual(10);
  });
});
