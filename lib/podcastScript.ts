import type { CleanedPage, PodcastScript, PodcastTurn, SummaryResult } from "@/lib/types";

type ConversationTheme =
  | "sports-injury"
  | "business-cuts"
  | "docs"
  | "thread"
  | "general";

function summarizeFluff(page: CleanedPage): string {
  const selectors = page.debug.removedSelectors.join(" ").toLowerCase();
  const parts: string[] = [];

  if (selectors.includes("nav") || selectors.includes("footer")) {
    parts.push("navigation chrome");
  }
  if (
    selectors.includes("cookie") ||
    selectors.includes("newsletter") ||
    selectors.includes("signup")
  ) {
    parts.push("cookie prompts and signup boxes");
  }
  if (
    selectors.includes("related") ||
    selectors.includes("recommend") ||
    selectors.includes("promo") ||
    selectors.includes("advert")
  ) {
    parts.push("related links and promo clutter");
  }

  return parts.length > 0 ? parts.join(", ") : "page furniture";
}

function trimTurn(text: string, maxLength = 260): string {
  if (text.length <= maxLength) {
    return text;
  }

  const shortened = text.slice(0, maxLength);
  const lastBreak = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf(", "),
    shortened.lastIndexOf(" "),
  );

  return `${shortened.slice(0, lastBreak > 0 ? lastBreak : maxLength).trim()}.`;
}

function normalizeForDialogue(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s-\s/g, " - ")
    .trim();
}

function titleTopic(title: string): string {
  return normalizeForDialogue(title)
    .replace(/\s*-\s*BBC News$/i, "")
    .replace(/\s*\|\s*.*$/i, "")
    .replace(/\s*,\s*says\s+.+$/i, "")
    .replace(/\s*:\s*/g, ": ");
}

function firstUsefulSentence(candidates: string[], title: string): string {
  const titleComparable = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  return (
    candidates
      .map(normalizeForDialogue)
      .filter((sentence) => sentence.length > 40)
      .filter((sentence) => {
        const comparable = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        return comparable !== titleComparable && !/^published\s*\d/i.test(sentence);
      })[0] ?? normalizeForDialogue(title)
  );
}

function paraphraseFact(sentence: string): string {
  return normalizeForDialogue(sentence)
    .replace(/\bhas confirmed\b/gi, "says")
    .replace(/\bwill miss\b/gi, "is set to miss")
    .replace(/\bafter suffering\b/gi, "because of")
    .replace(/\bwas set to be part of\b/gi, "had been expected to be part of")
    .replace(/\bin a statement published by\b/gi, "through")
    .replace(/\bthe article says\b/gi, "the piece says")
    .replace(/^The severity of his injury will unfortunately prevent him from/i, "The practical result is that he is not expected to")
    .replace(/^The severity of her injury will unfortunately prevent her from/i, "The practical result is that she is not expected to")
    .replace(/\s+"?confirmed .+$/i, ".")
    .replace(/\s+Why this matters:.+$/i, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function detectTheme(page: CleanedPage): ConversationTheme {
  const text = `${page.title} ${page.cleanedText}`.toLowerCase();

  if (page.pageType === "docs") {
    return "docs";
  }

  if (page.pageType === "thread") {
    return "thread";
  }

  if (
    /\b(world cup|champions league|premier league|striker|football|injury|injured|achilles|squad|season)\b/.test(text)
  ) {
    return "sports-injury";
  }

  if (/\b(job cuts|staff|savings|financial pressures|layoffs|redundancies|budget)\b/.test(text)) {
    return "business-cuts";
  }

  return "general";
}

function extractNamedFocus(page: CleanedPage): string {
  const topic = titleTopic(page.title);
  const beforeColon = topic.split(":")[0]?.trim();
  const beforeDash = topic.split(" - ")[0]?.trim();

  return beforeColon || beforeDash || topic;
}

function sportsConversation(page: CleanedPage, summary: SummaryResult, ignored: string): PodcastTurn[] {
  const topic = titleTopic(page.title);
  const focus = extractNamedFocus(page);
  const fact = paraphraseFact(firstUsefulSentence(summary.takeaways, page.title));
  const secondFact = paraphraseFact(summary.takeaways[1] ?? summary.selectedSentences[1] ?? summary.shortSummary);
  const mentionsWorldCup = /world cup/i.test(`${page.title} ${page.cleanedText}`);
  const mentionsClub = /\b(liverpool|club|season|champions league|premier league)\b/i.test(page.cleanedText);
  const eventFrame = mentionsWorldCup ? "a major tournament" : "the next big run of games";
  const clubFrame = mentionsClub ? "club and country" : "the team around him";

  return [
    {
      speaker: "Host A",
      text: trimTurn(`This is one of those sports stories where the headline is simple, but the timing is the whole thing: ${topic}.`),
    },
    {
      speaker: "Host B",
      text: "Yeah, that is rough. So this is not just an injury note - it changes the plans around him.",
    },
    {
      speaker: "Host A",
      text: trimTurn(`Exactly. The useful version is: ${fact}`),
    },
    {
      speaker: "Host B",
      text: `And for ${focus}, the pain is really the calendar, right?`,
    },
    {
      speaker: "Host A",
      text: trimTurn(`Right. You have ${eventFrame}, a season still moving, and ${clubFrame} suddenly having to plan without a player they expected to use.`),
    },
    {
      speaker: "Host B",
      text: "What should we not overdo here?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`Do not get lost in the surrounding ${ignored}. The part that matters is availability, recovery time, and what the coaches now have to rethink. ${secondFact}`),
    },
    {
      speaker: "Host B",
      text: "So the human version is: bad injury, brutal timing, and a ripple effect beyond one match report.",
    },
  ];
}

function businessCutsConversation(page: CleanedPage, summary: SummaryResult, ignored: string): PodcastTurn[] {
  const topic = titleTopic(page.title);
  const fact = paraphraseFact(firstUsefulSentence(summary.takeaways, page.title));
  const secondFact = paraphraseFact(summary.takeaways[1] ?? summary.selectedSentences[1] ?? summary.shortSummary);

  return [
    {
      speaker: "Host A",
      text: trimTurn(`This one is basically about pressure turning into action: ${topic}.`),
    },
    {
      speaker: "Host B",
      text: "So not just a corporate announcement - it is a signal that the numbers are forcing real decisions.",
    },
    {
      speaker: "Host A",
      text: trimTurn(`Exactly. The core move is: ${fact}`),
    },
    {
      speaker: "Host B",
      text: "The interesting question is whether this is just savings, or whether it reshapes what the organization actually does.",
    },
    {
      speaker: "Host A",
      text: trimTurn(`That is the tension. ${secondFact} The article is really about what gets protected when the budget gets smaller.`),
    },
    {
      speaker: "Host B",
      text: "And we do not need every bit of surrounding page furniture to understand that.",
    },
    {
      speaker: "Host A",
      text: trimTurn(`Right. Skip the ${ignored}; the useful takeaway is the scale of the cuts and the services or teams that may be next in line.`),
    },
  ];
}

function docsConversation(page: CleanedPage, summary: SummaryResult, ignored: string): PodcastTurn[] {
  const topic = titleTopic(page.title);
  const firstStep = paraphraseFact(firstUsefulSentence(summary.takeaways, page.title));
  const secondStep = paraphraseFact(summary.takeaways[1] ?? summary.selectedSentences[1] ?? summary.shortSummary);

  return [
    {
      speaker: "Host A",
      text: trimTurn(`This is a docs page, so the useful listen is not drama - it is orientation. The page is about ${topic}.`),
    },
    {
      speaker: "Host B",
      text: "If I were trying to use it, where would I start?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`Start with the shape of the task: ${firstStep}`),
    },
    {
      speaker: "Host B",
      text: "And the code blocks?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`Those are better seen than heard, so AudioLayer skips the code detail and keeps the setup, constraints, and gotchas. ${secondStep}`),
    },
    {
      speaker: "Host B",
      text: `So the listen is basically the map, minus the ${ignored}.`,
    },
  ];
}

function threadConversation(page: CleanedPage, summary: SummaryResult, ignored: string): PodcastTurn[] {
  const topic = titleTopic(page.title);
  const originalPoint = paraphraseFact(firstUsefulSentence(summary.takeaways, page.title));
  const replyPattern = paraphraseFact(summary.takeaways[1] ?? summary.selectedSentences[1] ?? summary.shortSummary);

  return [
    {
      speaker: "Host A",
      text: trimTurn(`This thread is about ${topic}, but the useful part is the pattern in the replies.`),
    },
    {
      speaker: "Host B",
      text: "So what is the room reacting to?",
    },
    {
      speaker: "Host A",
      text: trimTurn(originalPoint),
    },
    {
      speaker: "Host B",
      text: "And where does the conversation move after the original post?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`It clusters around this: ${replyPattern}`),
    },
    {
      speaker: "Host B",
      text: `Good. Skip the ${ignored} and just keep the signal.`,
    },
  ];
}

function generalConversation(page: CleanedPage, summary: SummaryResult, ignored: string): PodcastTurn[] {
  const topic = titleTopic(page.title);
  const mainMove = paraphraseFact(firstUsefulSentence(summary.takeaways, page.title));
  const secondMove = paraphraseFact(summary.takeaways[1] ?? summary.selectedSentences[1] ?? summary.shortSummary);
  const closing = paraphraseFact(summary.takeaways[2] ?? summary.selectedSentences[2] ?? "");

  return [
    {
      speaker: "Host A",
      text: trimTurn(`Okay, the useful version of this page is not every paragraph. It is the shift around ${topic}.`),
    },
    {
      speaker: "Host B",
      text: "So talk me through it like I am half-listening on a walk.",
    },
    {
      speaker: "Host A",
      text: trimTurn(`The main thing is this: ${mainMove}`),
    },
    {
      speaker: "Host B",
      text: "What makes that matter beyond the headline?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`It matters because the consequence is bigger than the line item. ${secondMove}`),
    },
    {
      speaker: "Host B",
      text: "And what can we safely skip?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`The surrounding ${ignored}. ${closing || "The takeaway is the direction of travel, not the page furniture around it."}`),
    },
  ];
}

export function createPodcastScript(
  page: CleanedPage,
  summary: SummaryResult,
): PodcastScript {
  const ignored = summarizeFluff(page);
  const theme = detectTheme(page);
  const turns =
    theme === "sports-injury"
      ? sportsConversation(page, summary, ignored)
      : theme === "business-cuts"
        ? businessCutsConversation(page, summary, ignored)
        : theme === "docs"
          ? docsConversation(page, summary, ignored)
          : theme === "thread"
            ? threadConversation(page, summary, ignored)
            : generalConversation(page, summary, ignored);

  const script = turns
    .map((turn) =>
      turn.cue
        ? `${turn.speaker}: ${turn.cue} ${turn.text}`
        : `${turn.speaker}: ${turn.text}`,
    )
    .join("\n");

  return {
    title: page.title,
    turns,
    script,
  };
}
