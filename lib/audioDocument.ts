import type { CleanedPage, PageType } from "@/lib/types";

export type AudioBlockKind =
  | "title"
  | "byline"
  | "timestamp"
  | "media"
  | "heading"
  | "paragraph"
  | "quote"
  | "bullet"
  | "code"
  | "thread-label"
  | "reply"
  | "related";

export interface AudioBlock {
  kind: AudioBlockKind;
  text: string;
  originalText: string;
  index: number;
  narratable: boolean;
  reason?: string;
}

export interface AudioDocument {
  title: string;
  pageType: PageType;
  blocks: AudioBlock[];
  narratableBlocks: AudioBlock[];
  stats: {
    blockCount: number;
    narratableBlockCount: number;
    sentenceCount: number;
    wordCount: number;
    isLongForm: boolean;
  };
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

export function normalizeAudioText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

export function normalizeComparable(text: string): string {
  return normalizeAudioText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeComparable(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function jaccardSimilarity(left: string, right: string): number {
  const leftSet = new Set(tokenize(left));
  const rightSet = new Set(tokenize(right));

  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftSet).filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
}

export function ensureSentence(text: string): string {
  return /[.!?]["')\]]?$/.test(text) ? text : `${text}.`;
}

export function splitTextBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(normalizeAudioText)
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return splitTextBlocks(text).flatMap((block) => {
    if (!/[.!?]/.test(block) && block.length <= 100) {
      return [ensureSentence(block)];
    }

    return block
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
      .map((sentence) => ensureSentence(normalizeAudioText(sentence)))
      .filter((sentence) => sentence.length >= 24);
  });
}

function stripBlockPrefix(text: string): string {
  return normalizeAudioText(text)
    .replace(/^Bullet:\s*/i, "")
    .replace(/^Reply\s+\d+(?:\s+from\s+[^.]+?)?(?:\s+at\s+[^.]+?)?\.\s*/i, "")
    .replace(/^Original post\.\s*/i, "")
    .replace(/^Top replies\.\s*/i, "")
    .trim();
}

function blockFingerprint(text: string): string {
  return normalizeComparable(stripBlockPrefix(text));
}

function isTitleBlock(block: string, page: CleanedPage): boolean {
  return normalizeComparable(block) === normalizeComparable(page.title);
}

function isBylineBlock(block: string): boolean {
  return /^by\s*[A-Z][A-Za-z .,'&-]{2,160}\.?$/i.test(block) &&
    !/\b(said|says|will|would|could|has|have|is|are|was|were|because|found|reveals)\b/i.test(block);
}

function isTimestampBlock(block: string): boolean {
  return /^(?:bullet:\s*)?(?:published|updated|last updated)\s*\d/i.test(block) ||
    /^(?:bullet:\s*)?(?:published|updated|last updated)\s+[A-Z][a-z]+\s+\d{1,2}/i.test(block) ||
    /^(?:bullet:\s*)?\d{1,2}\s+[A-Z][a-z]+\s+\d{4}(?:,?\s+\d{1,2}:\d{2})?/i.test(block) ||
    /^updated\s+\d{1,2}:\d{2}\s*[A-Z]{2,4}$/i.test(block) ||
    /^\d{1,2}:\d{2}$/.test(block);
}

function hasTerminalPunctuation(block: string): boolean {
  return /[.!?"')\]]$/.test(block);
}

function isHeadingBlock(block: string, page: CleanedPage): boolean {
  const comparable = normalizeComparable(block);
  return page.headings.some((heading) => normalizeComparable(heading) === comparable);
}

function isMediaBlock(block: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(block) ||
    /^(watch|listen):\s/i.test(block) ||
    /^(media|image|video)\s+caption,?/i.test(block) ||
    /\b(media|image|video)\s+caption\b/i.test(block) ||
    /^split pic\./i.test(block) ||
    /^undercover footage\b/i.test(block) ||
    /^on the left\b/i.test(block) ||
    /^on the right\b/i.test(block) ||
    /\b(faces blurred|photo of|picture of|cartoon depictions|in the background)\b/i.test(block);
}

function isCaptionLikeBlock(block: string, index: number, page: CleanedPage): boolean {
  if (page.pageType !== "article" || isHeadingBlock(block, page)) {
    return false;
  }

  const wordCount = block.split(/\s+/).length;
  const hasVisualCue = /\b(watch|media|image|video|photo|picture|footage|caption|pictured|shown|seen|left|right|blurred)\b/i.test(
    block,
  );

  return block.length <= 180 &&
    wordCount >= 3 &&
    wordCount <= 24 &&
    (!hasTerminalPunctuation(block) || hasVisualCue) &&
    (index <= 8 || hasVisualCue);
}

function isRelatedLinkLikeBlock(block: string, index: number, page: CleanedPage): boolean {
  if (page.pageType !== "article" || index < 4 || isHeadingBlock(block, page)) {
    return false;
  }

  const wordCount = block.split(/\s+/).length;
  const hasArticleAction = /\b(said|says|found|reveals|charged|told|explained|reported|announced|will|would|could|has|have|is|are)\b/i.test(
    block,
  );

  return block.length <= 110 &&
    wordCount >= 4 &&
    wordCount <= 16 &&
    !hasTerminalPunctuation(block) &&
    !hasArticleAction;
}

function stripThreadReplyMetadata(block: string, page: CleanedPage): string {
  const escapedTitle = page.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const replyTitlePattern = new RegExp(`^(Reply\\s+\\d+\\.\\s*)${escapedTitle}\\s*`, "i");

  return block
    .replace(/^Reply\s+(\d+)(?:\s+from\s+[^.]+?)?(?:\s+at\s+[^.]+?)?\.\s*/i, "Reply $1. ")
    .replace(replyTitlePattern, "$1")
    .replace(/\s*@[\w.-]+\s+posted\s+\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\s+/gi, " ")
    .replace(/\s*@[\w.-]+\s+\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\s+/gi, " ")
    .replace(
      /^Reply\s+(\d+)\.\s*@[\w.-]+\s+(?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|just now|yesterday)\s+/i,
      "Reply $1. ",
    )
    .replace(
      /^Reply\s+(\d+)\.\s*(?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|just now|yesterday)\s+/i,
      "Reply $1. ",
    )
    .trim();
}

function classifyBlock(block: string, index: number, page: CleanedPage): AudioBlock {
  const originalText = block;
  let text = block;
  let kind: AudioBlockKind = "paragraph";
  let narratable = true;
  let reason: string | undefined;

  if (isTitleBlock(block, page)) {
    kind = "title";
    narratable = false;
    reason = "duplicate title";
  } else if (isBylineBlock(block)) {
    kind = "byline";
    narratable = false;
    reason = "byline metadata";
  } else if (isTimestampBlock(block)) {
    kind = "timestamp";
    narratable = false;
    reason = "timestamp metadata";
  } else if (isMediaBlock(block) || isCaptionLikeBlock(block, index, page)) {
    kind = "media";
    narratable = false;
    reason = "media or caption block";
  } else if (isRelatedLinkLikeBlock(block, index, page)) {
    kind = "related";
    narratable = false;
    reason = "related-link style block";
  } else if (/^Original post\.?$/i.test(block) || /^Top replies\.?$/i.test(block)) {
    kind = "thread-label";
  } else if (/^Reply\s+\d+/i.test(block)) {
    kind = "reply";
    text = stripThreadReplyMetadata(block, page);
  } else if (/^Bullet:\s*/i.test(block)) {
    kind = "bullet";
    const bulletText = block.replace(/^Bullet:\s*/i, "").trim();
    text = page.pageType === "docs" ? `Bullet: ${bulletText}` : bulletText;
    if (isTimestampBlock(text) || isMediaBlock(text)) {
      narratable = false;
      reason = "metadata bullet";
    }
  } else if (/^(Code example omitted from audio version|A data table was omitted from the audio version)\.?$/i.test(block)) {
    kind = "code";
  } else if (isHeadingBlock(block, page)) {
    kind = "heading";
  } else if (/^["']/.test(block)) {
    kind = "quote";
  }

  return {
    kind,
    text: normalizeAudioText(text),
    originalText,
    index,
    narratable,
    reason,
  };
}

export function dedupeAudioBlocks(blocks: AudioBlock[]): AudioBlock[] {
  const selected: AudioBlock[] = [];
  const fingerprints = new Set<string>();

  for (const block of blocks) {
    if (!block.narratable) {
      selected.push(block);
      continue;
    }

    if (block.kind === "thread-label") {
      selected.push(block);
      continue;
    }

    const fingerprint = blockFingerprint(block.text);
    if (!fingerprint) {
      continue;
    }

    const isDuplicate = selected.some((existing) => {
      if (!existing.narratable) {
        return false;
      }

      if (block.kind === "reply" && existing.kind !== "reply") {
        return false;
      }

      const existingFingerprint = blockFingerprint(existing.text);
      return existingFingerprint === fingerprint ||
        (fingerprint.length > 70 && existingFingerprint.includes(fingerprint)) ||
        (existingFingerprint.length > 70 && fingerprint.includes(existingFingerprint)) ||
        jaccardSimilarity(existing.text, block.text) > 0.92;
    });

    if (fingerprints.has(fingerprint) || isDuplicate) {
      continue;
    }

    fingerprints.add(fingerprint);
    selected.push(block);
  }

  return selected;
}

export function buildAudioDocument(page: CleanedPage): AudioDocument {
  const rawBlocks = splitTextBlocks(page.cleanedText);
  const classifiedBlocks = rawBlocks.map((block, index) => classifyBlock(block, index, page));
  const blocks = dedupeAudioBlocks(classifiedBlocks);
  const narratableBlocks = blocks.filter((block) => block.narratable);
  const narratableText = narratableBlocks.map((block) => block.text).join("\n\n");
  const sentenceCount = splitSentences(narratableText).length;
  const wordCount = narratableText.split(/\s+/).filter(Boolean).length;

  return {
    title: page.title,
    pageType: page.pageType,
    blocks,
    narratableBlocks,
    stats: {
      blockCount: blocks.length,
      narratableBlockCount: narratableBlocks.length,
      sentenceCount,
      wordCount,
      isLongForm: wordCount >= 900 || narratableBlocks.length >= 20,
    },
  };
}

export function getNarratableBlocks(pageOrDocument: CleanedPage | AudioDocument): AudioBlock[] {
  return "narratableBlocks" in pageOrDocument
    ? pageOrDocument.narratableBlocks
    : buildAudioDocument(pageOrDocument).narratableBlocks;
}

export function getNarratableText(pageOrDocument: CleanedPage | AudioDocument): string {
  return getNarratableBlocks(pageOrDocument)
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

export function getNarratableSentences(pageOrDocument: CleanedPage | AudioDocument): string[] {
  return splitSentences(getNarratableText(pageOrDocument));
}
