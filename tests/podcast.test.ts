import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { cleanArticle } from "@/lib/extract/cleanArticle";
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

  it("makes article podcast mode conversational instead of a generic Q&A shell", () => {
    const page = cleanArticle({
      url: "https://example.com/sport/hugo-ekitike-injury",
      title: "Hugo Ekitike injury: France striker to miss World Cup, says Didier Deschamps",
      html: `
        <article>
          <h1>Hugo Ekitike injury: France striker to miss World Cup, says Didier Deschamps</h1>
          <p>France manager Didier Deschamps has confirmed striker Hugo Ekitike will miss the World Cup after suffering a suspected Achilles injury.</p>
          <p>France manager Didier Deschamps has confirmed striker Hugo Ekitike will miss the World Cup after suffering a suspected Achilles injury during Liverpool's Champions League defeat by Paris St-Germain on Tuesday.</p>
          <p>The severity of his injury will unfortunately prevent him from finishing the season with Liverpool and participating in the World Cup, confirmed Deschamps in a statement published by the French Football Federation.</p>
          <p>He made his France debut last September and was set to be part of Deschamps' squad for this summer's World Cup in the United States, Canada and Mexico.</p>
        </article>
      `,
    });
    const summary = summarizePage(page);
    const script = createPodcastScript(page, summary);

    expect(script.script).not.toContain("Give me the sharp version");
    expect(script.script).not.toContain("What did AudioLayer intentionally leave out");
    expect(script.script).toContain("timing");
    expect(script.script).toContain("not just an injury note");
    expect(script.script).toContain("bad injury, brutal timing");
  });
});
