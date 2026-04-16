import {
  buildAudioDocument,
  ensureSentence,
  getNarratableBlocks,
  getNarratableSentences,
  normalizeAudioText,
  normalizeComparable,
  splitSentences,
  tokenize,
  type AudioDocument,
} from "@/lib/audioDocument";
import type { CleanedPage, PodcastScript, PodcastTurn, SummaryResult } from "@/lib/types";

interface PodcastBrief {
  subject: string;
  lead: string;
  detail: string;
  consequence: string;
  response?: string;
  next?: string;
  closing: string;
  isLongForm: boolean;
}

const BANNED_SPOKEN_PHRASES = [
  "audiolayer",
  "navigation chrome",
  "page furniture",
  "human version",
  "useful version",
  "what should we not overdo",
  "talk me through it like",
  "intentionally leave out",
  "watch:",
  "media caption",
  "image caption",
  "video caption",
];

const ENTITY_STOPWORDS = new Set([
  "A",
  "An",
  "And",
  "As",
  "At",
  "But",
  "By",
  "For",
  "From",
  "In",
  "It",
  "On",
  "Or",
  "The",
  "This",
  "To",
  "Why",
]);

function normalizeForDialogue(text: string): string {
  return normalizeAudioText(text)
    .replace(/\s+-\s+/g, " - ")
    .trim();
}

function trimTurn(text: string, maxLength = 330): string {
  const normalized = normalizeForDialogue(text);

  if (normalized.length <= maxLength) {
    return ensureSentence(normalized);
  }

  const sentences = splitSentences(normalized);
  const selected: string[] = [];
  let length = 0;

  for (const sentence of sentences) {
    if (length + sentence.length > maxLength) {
      break;
    }

    selected.push(sentence);
    length += sentence.length + 1;
  }

  if (selected.length > 0) {
    return ensureSentence(selected.join(" "));
  }

  const shortened = normalized.slice(0, maxLength);
  const lastBreak = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("? "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf(", "),
    shortened.lastIndexOf(" "),
  );

  return ensureSentence(
    shortened
      .slice(0, lastBreak > 0 ? lastBreak : maxLength)
      .replace(/\b(and|or|but|because|with|the|a|an|to|of)$/i, "")
      .trim(),
  );
}

function cleanTitle(title: string): string {
  return normalizeForDialogue(title)
    .replace(/\s*-\s*(BBC News|The Guardian|CNN|Reuters|AP News|Associated Press).*$/i, "")
    .replace(/\s*\|\s*.*$/i, "")
    .replace(/\s*,\s*(?:says|said|finds|reports|analysis|explainer).+$/i, "")
    .replace(/\s*:\s*/g, ": ")
    .trim();
}

function lowerFirst(text: string): string {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function readableSubjectFromTitle(title: string): string {
  const cleaned = cleanTitle(title);

  if (!cleaned) {
    return "this page";
  }

  const colonPrefix = cleaned.split(":")[0]?.trim();
  if (colonPrefix && colonPrefix !== cleaned && colonPrefix.split(/\s+/).length <= 5) {
    if (/\binjury$/i.test(colonPrefix)) {
      return colonPrefix.replace(/\s+injury$/i, "'s injury");
    }

    return colonPrefix;
  }

  const helpMatch = cleaned.match(/^(.+?)\s+helps?\s+(.+)$/i);
  if (helpMatch?.[1] && helpMatch[2]) {
    return lowerFirst(`${helpMatch[1]} helping ${helpMatch[2]}`);
  }

  const toMatch = cleaned.match(/^([A-Z][A-Za-z0-9& .'-]{2,80})\s+to\s+(.+)$/);
  if (toMatch?.[1] && toMatch[2]) {
    return `${toMatch[1]} planning to ${toMatch[2]}`;
  }

  if (cleaned.split(/\s+/).length <= 14) {
    return lowerFirst(cleaned);
  }

  return "this story";
}

function comparableText(text: string): string {
  return normalizeComparable(text);
}

function isLowValueSentence(sentence: string, page: CleanedPage): boolean {
  const comparable = comparableText(sentence);

  return !comparable ||
    comparable === comparableText(page.title) ||
    /^(published|updated|last updated)\s*\d/.test(comparable) ||
    /^\d{1,2}:\d{2}$/.test(comparable) ||
    /^(watch|listen|media caption|image caption|video caption)\b/i.test(sentence) ||
    /^by\s+[a-z]+/.test(comparable);
}

function cleanCandidateSentence(sentence: string, page: CleanedPage): string | null {
  const cleaned = normalizeForDialogue(sentence)
    .replace(/^Bullet:\s*/i, "")
    .replace(/^Original post\.\s*/i, "")
    .replace(/^Top replies\.\s*/i, "")
    .replace(/^Reply\s+\d+\.\s*/i, "")
    .replace(/\s+in a statement published by [^.]+/gi, "")
    .replace(/,\s*(?:confirmed|said|says|told|added)\s+[^.]{2,120}$/i, ".")
    .replace(/\bhas confirmed\b/gi, "says")
    .trim();

  if (!cleaned || isLowValueSentence(cleaned, page)) {
    return null;
  }

  if (page.pageType === "docs" && /^(code example omitted|a data table was omitted)/i.test(cleaned)) {
    return null;
  }

  return ensureSentence(cleaned);
}

function uniqueSentences(sentences: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const sentence of sentences.map(normalizeForDialogue)) {
    const comparable = comparableText(sentence);
    if (!comparable || seen.has(comparable)) {
      continue;
    }

    seen.add(comparable);
    output.push(sentence);
  }

  return output;
}

function getCandidateSentences(page: CleanedPage, summary: SummaryResult): string[] {
  const document = buildAudioDocument(page);

  return uniqueSentences([
    ...summary.selectedSentences,
    ...summary.takeaways,
    summary.shortSummary,
    ...getNarratableSentences(document),
  ])
    .map((sentence) => cleanCandidateSentence(sentence, page))
    .filter((sentence): sentence is string => Boolean(sentence));
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function findFact(
  sentences: string[],
  pattern: RegExp,
  used: string[] = [],
): string | undefined {
  return sentences.find(
    (sentence) =>
      pattern.test(sentence) &&
      !used.some((current) => tokenSimilarity(current, sentence) > 0.5),
  );
}

function extractEntities(text: string): string[] {
  const matches =
    normalizeForDialogue(text).match(
      /\b(?:[A-Z][A-Za-z0-9-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9-]*|[A-Z]{2,}|of|and|&))*\b/g,
    ) ?? [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const match of matches) {
    const firstWord = match.split(/\s+/)[0];
    const comparable = comparableText(match);

    if (match.length < 3 || ENTITY_STOPWORDS.has(firstWord) || seen.has(comparable)) {
      continue;
    }

    seen.add(comparable);
    output.push(match);
  }

  return output;
}

function extractSubject(page: CleanedPage, sentences: string[]): string {
  if (page.pageType === "docs" || page.pageType === "thread") {
    return cleanTitle(page.title);
  }

  const titleSubject = readableSubjectFromTitle(page.title);
  if (titleSubject && titleSubject !== "this story") {
    return titleSubject;
  }

  return extractEntities([page.title, ...sentences.slice(0, 3)].join(" "))[0] ?? "this story";
}

function chooseLead(sentences: string[], page: CleanedPage): string {
  const titleTokens = new Set(tokenize(page.title));

  return (
    sentences
      .map((sentence, index) => {
        const tokens = tokenize(sentence);
        const actionScore = /\b(says|said|announced|found|reveals?|shows?|will|has|have|is|are|plans?|expects?)\b/i.test(
          sentence,
        )
          ? 2
          : 0;

        return {
          sentence,
          score: overlap(tokens, titleTokens) * 1.4 + actionScore + Math.max(0, 4 - index * 0.35),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.sentence ?? page.title
  );
}

function overlap(tokens: string[], reference: Set<string>): number {
  if (tokens.length === 0 || reference.size === 0) {
    return 0;
  }

  return tokens.filter((token) => reference.has(token)).length / reference.size;
}

function buildArticleBrief(page: CleanedPage, summary: SummaryResult, document: AudioDocument): PodcastBrief {
  const sentences = getCandidateSentences(page, summary);
  const subject = extractSubject(page, sentences);
  const lead = chooseLead(sentences, page);
  const used = [lead];
  const detail =
    findFact(
      sentences,
      /\b(after|because|including|evidence|reported|according|data|figures?|percent|million|billion|charged|cost|fees?|method|approach)\b/i,
      used,
    ) ??
    sentences.find((sentence) => tokenSimilarity(sentence, lead) < 0.45) ??
    lead;

  used.push(detail);

  const consequence =
    findFact(
      sentences,
      /\b(means|could|may|might|risk|impact|change|affect|pressure|problem|concern|full force|response|denied|suspended|removed|review)\b/i,
      used,
    ) ??
    findFact(sentences, /\b(next|expected|remain|unclear|future|timeline|plans?)\b/i, used) ??
    summary.whyThisMatters;

  used.push(consequence);

  const response = findFact(
    sentences,
    /\b(response|responded|denied|said|spokesperson|officials?|company|government|regulator|court|police|lawyer|minister|office)\b/i,
    used,
  );

  if (response) {
    used.push(response);
  }

  const next = findFact(
    sentences,
    /\b(next|expected|could|may|might|remain|unclear|review|investigation|future|timeline|confirm|scans?)\b/i,
    used,
  );

  const closing =
    next ??
    consequence ??
    "The useful point is what changes for the people, teams, or organisations involved.";

  return {
    subject,
    lead,
    detail,
    consequence,
    response,
    next,
    closing,
    isLongForm: document.stats.isLongForm,
  };
}

function buildDocsBrief(page: CleanedPage, summary: SummaryResult, document: AudioDocument): PodcastBrief {
  const sentences = getCandidateSentences(page, summary);
  const subject = extractSubject(page, sentences);
  const lead = sentences[0] ?? `${subject} explains a task step by step.`;
  const detail =
    findFact(sentences, /\b(start|setup|create|choose|install|configure|request|response|endpoint|constraint|limit)\b/i) ??
    sentences[1] ??
    lead;
  const hasCode = getNarratableBlocks(document).some((block) => block.kind === "code");
  const consequence = hasCode
    ? "The code examples are still best checked on the page, but the audio can give you the route through the task."
    : "The audio is best for understanding the order of steps before you return to the page.";

  return {
    subject,
    lead,
    detail,
    consequence,
    closing: consequence,
    isLongForm: false,
  };
}

function buildThreadBrief(page: CleanedPage, summary: SummaryResult): PodcastBrief {
  const sentences = getCandidateSentences(page, summary);
  const subject = extractSubject(page, sentences);
  const lead = sentences[0] ?? `${subject} starts with a question or claim.`;
  const detail =
    findFact(sentences.slice(1), /\b(reply|replies|people|some|others|agree|disagree|would|want|think|use)\b/i) ??
    sentences.find((sentence) => tokenSimilarity(sentence, lead) < 0.45) ??
    lead;
  const consequence = "The value is in the pattern of replies: where people agree, push back, or add a practical detail.";

  return {
    subject,
    lead,
    detail,
    consequence,
    closing: consequence,
    isLongForm: false,
  };
}

function buildPodcastBrief(page: CleanedPage, summary: SummaryResult): PodcastBrief {
  const document = buildAudioDocument(page);

  if (page.pageType === "docs") {
    return buildDocsBrief(page, summary, document);
  }

  if (page.pageType === "thread") {
    return buildThreadBrief(page, summary);
  }

  return buildArticleBrief(page, summary, document);
}

function articleConversation(brief: PodcastBrief): PodcastTurn[] {
  const turns: PodcastTurn[] = [
    {
      speaker: "Host A",
      text: trimTurn(`This page is about ${brief.subject}.`),
    },
    {
      speaker: "Host B",
      text: "What matters most?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.lead),
    },
    {
      speaker: "Host B",
      text: "What detail makes that worth paying attention to?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.detail),
    },
    {
      speaker: "Host B",
      text: "Why does it matter?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.consequence),
    },
  ];

  if (brief.isLongForm) {
    turns.push(
      {
        speaker: "Host B",
        text: "Is there a response or next step?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.response ?? brief.next ?? brief.closing),
      },
      {
        speaker: "Host B",
        text: "So what should I keep in mind after listening?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.closing),
      },
    );
  } else {
    turns.push(
      {
        speaker: "Host B",
        text: "Where does that leave us?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.closing),
      },
    );
  }

  return turns;
}

function docsConversation(brief: PodcastBrief): PodcastTurn[] {
  return [
    {
      speaker: "Host A",
      text: trimTurn(`This docs page is about ${brief.subject}.`),
    },
    {
      speaker: "Host B",
      text: "Where should someone start?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.lead),
    },
    {
      speaker: "Host B",
      text: "What should they keep open on the screen?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`${brief.detail} ${brief.consequence}`),
    },
    {
      speaker: "Host B",
      text: trimTurn(brief.closing),
    },
  ];
}

function threadConversation(brief: PodcastBrief): PodcastTurn[] {
  return [
    {
      speaker: "Host A",
      text: trimTurn(`This thread is about ${brief.subject}.`),
    },
    {
      speaker: "Host B",
      text: "What starts the conversation?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.lead),
    },
    {
      speaker: "Host B",
      text: "Where do the replies add signal?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.detail),
    },
    {
      speaker: "Host B",
      text: trimTurn(brief.closing),
    },
  ];
}

function renderConversation(page: CleanedPage, brief: PodcastBrief): PodcastTurn[] {
  if (page.pageType === "docs") {
    return docsConversation(brief);
  }

  if (page.pageType === "thread") {
    return threadConversation(brief);
  }

  return articleConversation(brief);
}

function styleGuard(turns: PodcastTurn[], brief: PodcastBrief): PodcastTurn[] {
  return turns.map((turn, index) => {
    const text = trimTurn(turn.text);
    const lower = text.toLowerCase();
    const hasBannedPhrase = BANNED_SPOKEN_PHRASES.some((phrase) => lower.includes(phrase));

    if (!hasBannedPhrase) {
      return {
        ...turn,
        text,
      };
    }

    return {
      ...turn,
      text:
        turn.speaker === "Host B"
          ? index % 2 === 0
            ? "Why does that matter?"
            : "What changes from here?"
          : trimTurn(index > 4 ? brief.closing : brief.lead),
    };
  });
}

export function createPodcastScript(
  page: CleanedPage,
  summary: SummaryResult,
): PodcastScript {
  const brief = buildPodcastBrief(page, summary);
  const turns = styleGuard(renderConversation(page, brief), brief);
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
