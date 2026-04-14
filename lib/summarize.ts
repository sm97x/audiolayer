import type { CleanedPage, SummaryResult } from "@/lib/types";

interface SentenceRecord {
  sentence: string;
  paragraphIndex: number;
  sentenceIndex: number;
  tokens: string[];
  score: number;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
  "you",
  "your",
]);

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function ensureSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function normalizeComparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLowValueAudioSentence(sentence: string, title: string): boolean {
  const comparable = normalizeComparable(sentence);
  const titleComparable = normalizeComparable(title);

  if (!comparable) {
    return true;
  }

  if (comparable === titleComparable) {
    return true;
  }

  if (/^(published|updated|last updated)\s*\d/.test(comparable)) {
    return true;
  }

  if (/^\d{1,2}\s+[a-z]+\s+\d{4}\s+\d{1,2}\s+\d{2}/.test(comparable)) {
    return true;
  }

  return false;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function paragraphSentences(text: string): Array<{ sentence: string; paragraphIndex: number }> {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph, paragraphIndex) => {
      if (!/[.!?]/.test(paragraph) && paragraph.length <= 90) {
        return [{ sentence: ensureSentence(paragraph), paragraphIndex }];
      }

      return paragraph
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 24)
        .map((sentence) => ({
          sentence: ensureSentence(sentence),
          paragraphIndex,
        }));
    });
}

function overlap(tokens: string[], reference: Set<string>): number {
  if (reference.size === 0 || tokens.length === 0) {
    return 0;
  }

  const shared = tokens.filter((token) => reference.has(token)).length;
  return shared / reference.size;
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = Array.from(leftSet).filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
}

function buildWhyThisMatters(page: CleanedPage): string {
  if (page.pageType === "docs") {
    return "Why this matters: it turns the essential steps and constraints into something you can absorb away from the screen.";
  }

  if (page.pageType === "thread") {
    return "Why this matters: it keeps the original point and the strongest replies without forcing you through the repetitive thread mechanics.";
  }

  return "Why this matters: it pulls the central claim, supporting evidence, and payoff into a version that is useful in under two minutes.";
}

export function summarizePage(page: CleanedPage): SummaryResult {
  const titleTokens = new Set(tokenize(page.title));
  const headingTokens = new Set(page.headings.flatMap((heading) => tokenize(heading)));
  const sentences = paragraphSentences(page.cleanedText)
    .filter((record) => !isLowValueAudioSentence(record.sentence, page.title))
    .map((record, sentenceIndex) => ({
      ...record,
      sentenceIndex,
      tokens: tokenize(record.sentence),
      score: 0,
    }));

  const termFrequency = new Map<string, number>();
  sentences.forEach((record) => {
    record.tokens.forEach((token) => {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    });
  });

  const topTerms = new Set(
    Array.from(termFrequency.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 16)
      .map(([term]) => term),
  );

  const scored = sentences.map((record) => {
    const tfScore = record.tokens.reduce(
      (total, token) => total + (topTerms.has(token) ? (termFrequency.get(token) ?? 0) : 0),
      0,
    );
    const positionScore =
      1 - clamp(record.paragraphIndex / Math.max(1, page.cleanedText.split(/\n{2,}/).length), 0, 0.9);
    const lexicalDiversity =
      record.tokens.length > 0 ? new Set(record.tokens).size / record.tokens.length : 0;
    const lengthBonus =
      record.tokens.length >= 8 && record.tokens.length <= 32
        ? 0.5
        : record.tokens.length < 6
          ? -0.35
          : 0;

    return {
      ...record,
      score:
        overlap(record.tokens, titleTokens) * 2.4 +
        overlap(record.tokens, headingTokens) * 1.2 +
        clamp(tfScore / 18) * 1.1 +
        positionScore * 0.8 +
        lexicalDiversity * 0.4 +
        lengthBonus,
    } satisfies SentenceRecord;
  });

  const ranked = [...scored].sort((left, right) => right.score - left.score);
  const selected: SentenceRecord[] = [];

  for (const candidate of ranked) {
    const similarity = selected.length
      ? Math.max(...selected.map((current) => jaccard(current.tokens, candidate.tokens)))
      : 0;

    if (similarity > 0.62) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= 4) {
      break;
    }
  }

  const ordered = selected.sort((left, right) => left.sentenceIndex - right.sentenceIndex);
  const shortSummary = ordered.map((record) => record.sentence).join(" ");

  const takeaways = ranked
    .filter((candidate) => candidate.sentence.length >= 45)
    .filter((candidate) => !isLowValueAudioSentence(candidate.sentence, page.title))
    .reduce<string[]>((accumulator, candidate) => {
      const isDuplicate = accumulator.some(
        (item) => jaccard(tokenize(item), candidate.tokens) > 0.66,
      );

      if (!isDuplicate) {
        accumulator.push(candidate.sentence);
      }

      return accumulator;
    }, [])
    .slice(0, 3);

  return {
    shortSummary,
    takeaways,
    whyThisMatters: buildWhyThisMatters(page),
    selectedSentences: ordered.map((record) => record.sentence),
  };
}

export function buildBriefTranscript(page: CleanedPage, summary: SummaryResult): string {
  const takeaways = summary.takeaways
    .map((takeaway, index) => `${index === 0 ? "First" : index === 1 ? "Second" : "Third"}, ${takeaway}`)
    .join(" ");

  return [
    `Briefing on ${page.title}.`,
    summary.shortSummary,
    "Key takeaways.",
    takeaways,
    summary.whyThisMatters,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildReadTranscript(page: CleanedPage): string {
  return [`Read it mode for ${page.title}.`, page.cleanedText]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
