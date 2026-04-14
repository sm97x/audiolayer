import type { CleanedPage, PodcastScript, PodcastTurn, SummaryResult } from "@/lib/types";

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
    parts.push("cookie and signup prompts");
  }
  if (
    selectors.includes("related") ||
    selectors.includes("recommend") ||
    selectors.includes("promo") ||
    selectors.includes("advert")
  ) {
    parts.push("related links and promo clutter");
  }

  return parts.length > 0 ? parts.join(", ") : "repetitive page chrome";
}

function trimTurn(text: string, maxLength = 240): string {
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

export function createPodcastScript(
  page: CleanedPage,
  summary: SummaryResult,
): PodcastScript {
  const takeaways = summary.takeaways.slice(0, 3);
  const ignored = summarizeFluff(page);

  const turns: PodcastTurn[] = [
    {
      speaker: "Host A",
      cue: "[measured]",
      text: trimTurn(`Today we're looking at ${page.title}. ${summary.shortSummary}`),
    },
    {
      speaker: "Host B",
      text: "Give me the sharp version. What should I actually remember from this page?",
    },
    {
      speaker: "Host A",
      text: trimTurn(takeaways[0] ?? summary.shortSummary),
    },
    {
      speaker: "Host B",
      text: "And what's the second-order point once you strip out the surface noise?",
    },
    {
      speaker: "Host A",
      text: trimTurn(
        [takeaways[1], summary.whyThisMatters].filter(Boolean).join(" "),
      ),
    },
    {
      speaker: "Host B",
      text: "What did AudioLayer intentionally leave out?",
    },
    {
      speaker: "Host A",
      text: trimTurn(
        `We skipped ${ignored}. ${takeaways[2] ?? "The remaining signal was concise enough to keep the listen moving."}`,
      ),
    },
    {
      speaker: "Host B",
      text: "So it lands like a smart recap, not a literal read-aloud.",
    },
  ];

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
