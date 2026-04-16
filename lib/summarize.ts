import {
  buildAudioDocument,
  ensureSentence,
  getNarratableBlocks,
  getNarratableSentences,
  getNarratableText,
  jaccardSimilarity,
  normalizeAudioText,
  normalizeComparable,
  splitSentences,
  tokenize,
  type AudioBlock,
  type AudioDocument,
} from "@/lib/audioDocument";
import type { CleanedPage, SummaryResult } from "@/lib/types";

interface SentenceRecord {
  sentence: string;
  paragraphIndex: number;
  sentenceIndex: number;
  tokens: string[];
  score: number;
}

interface BriefCandidate {
  sentence: string;
  tokens: string[];
  position: number;
  sourceBoost: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function overlap(tokens: string[], reference: Set<string>): number {
  if (tokens.length === 0 || reference.size === 0) {
    return 0;
  }

  return tokens.filter((token) => reference.has(token)).length / reference.size;
}

function isLowValueAudioSentence(sentence: string, title: string): boolean {
  const comparable = normalizeComparable(sentence);
  const titleComparable = normalizeComparable(title);

  return !comparable ||
    comparable === titleComparable ||
    /^(published|updated|last updated)\s*\d/.test(comparable) ||
    /^\d{1,2}\s+[a-z]+\s+\d{4}\b/.test(comparable) ||
    /^\d{1,2}:\d{2}$/.test(comparable) ||
    /^(watch|listen|media caption|image caption|video caption)\b/i.test(sentence);
}

function sentenceRecordsFromDocument(document: AudioDocument): SentenceRecord[] {
  let sentenceIndex = 0;

  return document.narratableBlocks.flatMap((block, paragraphIndex) =>
    splitSentences(block.text)
      .filter((sentence) => sentence.length >= 24)
      .map((sentence) => ({
        sentence: ensureSentence(sentence),
        paragraphIndex,
        sentenceIndex: sentenceIndex++,
        tokens: tokenize(sentence),
        score: 0,
      })),
  );
}

function buildWhyThisMatters(page: CleanedPage): string {
  if (page.pageType === "docs") {
    return "It gives you the path through the task before you go back for exact code or settings.";
  }

  if (page.pageType === "thread") {
    return "It keeps the original point and the replies that add the most signal.";
  }

  return "It keeps the main point and the important context in a short listen.";
}

function stripExtractiveNoise(text: string): string {
  return normalizeAudioText(text)
    .replace(/^Bullet:\s*/i, "")
    .replace(/^Original post\.\s*/i, "")
    .replace(/^Top replies\.\s*/i, "")
    .replace(/^Reply\s+\d+\.\s*/i, "")
    .replace(/\s+in a statement published by [^.]+/gi, "")
    .replace(/,\s*(?:confirmed|said|says|told|added)\s+[^.]{2,120}$/i, ".")
    .replace(/\bhas confirmed\b/gi, "says")
    .replace(/^["'\u201c\u201d](.+)["'\u201c\u201d]$/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBriefSentence(sentence: string, page: CleanedPage): string | null {
  const cleaned = stripExtractiveNoise(sentence);

  if (!cleaned || isLowValueAudioSentence(cleaned, page.title)) {
    return null;
  }

  if (/^(original post|top replies|code example omitted from audio version)\.?$/i.test(cleaned)) {
    return null;
  }

  if (page.pageType === "docs" && /^(inline code|code example omitted|a data table was omitted)/i.test(cleaned)) {
    return null;
  }

  if (page.pageType === "article" && cleaned.length < 45) {
    return null;
  }

  return ensureSentence(cleaned);
}

function sentenceSimilarity(left: string, right: string): number {
  return jaccardSimilarity(left, right);
}

function hasDuplicateMeaning(left: string, right: string, titleTokens: Set<string>): boolean {
  const leftComparable = normalizeComparable(left);
  const rightComparable = normalizeComparable(right);

  if (leftComparable === rightComparable) {
    return true;
  }

  if (
    leftComparable.length > 80 &&
    rightComparable.length > 80 &&
    (leftComparable.includes(rightComparable) || rightComparable.includes(leftComparable))
  ) {
    return true;
  }

  const sharedTitleTokens = tokenize(left)
    .filter((token) => titleTokens.has(token) && tokenize(right).includes(token)).length;

  return sentenceSimilarity(left, right) > 0.46 || sharedTitleTokens >= 4;
}

function buildBriefCandidates(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): BriefCandidate[] {
  const rawCandidates = [
    ...summary.selectedSentences.map((sentence) => ({ sentence, sourceBoost: 1.25 })),
    ...summary.takeaways.map((sentence) => ({ sentence, sourceBoost: 1.05 })),
    ...getNarratableSentences(document).map((sentence) => ({ sentence, sourceBoost: 0.75 })),
  ];
  const seen = new Set<string>();
  const candidates: BriefCandidate[] = [];

  rawCandidates.forEach((candidate, position) => {
    const sentence = cleanBriefSentence(candidate.sentence, page);
    if (!sentence) {
      return;
    }

    const comparable = normalizeComparable(sentence);
    if (!comparable || seen.has(comparable)) {
      return;
    }

    seen.add(comparable);
    candidates.push({
      sentence,
      tokens: tokenize(sentence),
      position,
      sourceBoost: candidate.sourceBoost,
    });
  });

  return candidates;
}

function rankBriefCandidates(
  page: CleanedPage,
  candidates: BriefCandidate[],
): BriefCandidate[] {
  const titleTokens = new Set(tokenize(page.title));
  const headingTokens = new Set(page.headings.flatMap((heading) => tokenize(heading)));

  return [...candidates].sort((left, right) => {
    const score = (candidate: BriefCandidate): number => {
      const actionScore = /\b(says|said|announced|found|reveals?|shows?|will|would|could|has|have|is|are|plans?|expects?)\b/i.test(
        candidate.sentence,
      )
        ? 0.7
        : 0;
      const detailScore = /\b(because|including|evidence|figures?|data|response|denied|warned|risk|impact|means|percent|million|billion|next|expected|could|may)\b/i.test(
        candidate.sentence,
      )
        ? 0.55
        : 0;
      const positionScore = Math.max(0, 1 - candidate.position / Math.max(1, candidates.length));
      const lengthPenalty = candidate.tokens.length > 42 ? 0.35 : candidate.tokens.length < 7 ? 0.35 : 0;

      return (
        candidate.sourceBoost +
        overlap(candidate.tokens, titleTokens) * 1.6 +
        overlap(candidate.tokens, headingTokens) * 0.7 +
        actionScore +
        detailScore +
        positionScore * 0.45 -
        lengthPenalty
      );
    };

    return score(right) - score(left);
  });
}

function selectUniqueBriefSentences(
  page: CleanedPage,
  candidates: BriefCandidate[],
  maxSentences: number,
): string[] {
  const selected: string[] = [];
  const titleTokens = new Set(tokenize(page.title));

  for (const candidate of candidates) {
    const isDuplicate = selected.some((sentence) =>
      hasDuplicateMeaning(sentence, candidate.sentence, titleTokens),
    );

    if (isDuplicate) {
      continue;
    }

    selected.push(candidate.sentence);
    if (selected.length >= maxSentences) {
      break;
    }
  }

  return selected;
}

function findByPattern(
  candidates: BriefCandidate[],
  selected: string[],
  page: CleanedPage,
  pattern: RegExp,
): BriefCandidate | undefined {
  const titleTokens = new Set(tokenize(page.title));

  return candidates.find(
    (candidate) =>
      pattern.test(candidate.sentence) &&
      !selected.some((sentence) => hasDuplicateMeaning(sentence, candidate.sentence, titleTokens)),
  );
}

function buildArticleBrief(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): string[] {
  const ranked = rankBriefCandidates(page, buildBriefCandidates(page, summary, document));
  const selected: string[] = [];
  const maxSentences = document.stats.isLongForm ? 5 : 3;
  const slots = [
    /\b(says|said|announced|found|reveals?|shows?|will|has|have|is|are)\b/i,
    /\b(after|because|including|evidence|reported|according|data|figures?|percent|million|billion|charged|cost|fees?)\b/i,
    /\b(response|responded|denied|warned|criticised|officials?|company|government|spokesperson|regulator|court|police|lawyer|minister)\b/i,
    /\b(next|expected|could|may|might|remain|unclear|review|investigation|change|plans?|future|timeline)\b/i,
  ];

  for (const pattern of slots) {
    if (selected.length >= maxSentences) {
      break;
    }

    const match = findByPattern(ranked, selected, page, pattern);
    if (match) {
      selected.push(match.sentence);
    }
  }

  if (selected.length < maxSentences) {
    selected.push(
      ...selectUniqueBriefSentences(
        page,
        ranked.filter((candidate) => !selected.includes(candidate.sentence)),
        maxSentences - selected.length,
      ),
    );
  }

  return selected.slice(0, maxSentences);
}

function buildDocsBrief(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): string[] {
  const candidates = buildBriefCandidates(page, summary, document);
  const ranked = rankBriefCandidates(page, candidates);
  const selected: BriefCandidate[] = [];
  const purpose = ranked.find((candidate) => candidate.position <= 8 && candidate.sentence.length >= 45);
  const setup = ranked.find((candidate) =>
    /\b(start|setup|create|choose|install|configure|request|response|endpoint|constraint|limit)\b/i.test(
      candidate.sentence,
    ),
  );

  if (purpose) {
    selected.push(purpose);
  }

  if (setup && setup !== purpose) {
    selected.push(setup);
  }

  const brief = selectUniqueBriefSentences(page, selected.length ? selected : ranked, 2);
  const hasCode = getNarratableBlocks(document).some((block) => block.kind === "code");

  return hasCode
    ? [...brief, "Code examples are better checked on the page; the audio version is best for the flow of the task."].slice(0, 3)
    : brief.slice(0, 3);
}

function blockSentences(block: AudioBlock, page: CleanedPage): BriefCandidate[] {
  return splitSentences(block.text)
    .map((sentence) => cleanBriefSentence(sentence, page) ?? "")
    .filter(Boolean)
    .map((sentence, index) => ({
      sentence,
      tokens: tokenize(sentence),
      position: block.index * 10 + index,
      sourceBoost: block.kind === "reply" ? 1.1 : 1,
    }));
}

function buildThreadBrief(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): string[] {
  if (page.threadModel) {
    const original = page.threadModel.originalPost?.text;
    const themes = page.threadModel.themes ?? [];
    const replyCount = page.threadModel.replies.length;
    const sentences: string[] = [];

    if (original) {
      sentences.push(`The original post is about this: ${trimForBrief(original, 220)}`);
    } else {
      sentences.push(`The thread starts with ${page.threadModel.title}.`);
    }

    if (themes.length > 0) {
      sentences.push(
        `The replies mainly focus on ${joinNaturalList(themes.slice(0, 3))}.`,
      );
    } else if (replyCount > 0) {
      sentences.push(`The replies add ${replyCount === 1 ? "one useful response" : `${replyCount} useful responses`} rather than a single article-style point.`);
    }

    const tension = inferThreadTension(page.threadModel.replies.map((reply) => reply.text));
    if (tension) {
      sentences.push(tension);
    }

    sentences.push("The useful takeaway is the pattern in the replies, not every comment line by line.");
    return sentences.slice(0, document.stats.isLongForm ? 4 : 3);
  }

  const originalSentences: BriefCandidate[] = [];
  const replySentences: BriefCandidate[] = [];
  let section: "original" | "replies" | undefined;

  getNarratableBlocks(document).forEach((block) => {
    if (block.kind === "thread-label" && /^Original post/i.test(block.text)) {
      section = "original";
      return;
    }

    if (block.kind === "thread-label" && /^Top replies/i.test(block.text)) {
      section = "replies";
      return;
    }

    const target = block.kind === "reply" || section === "replies" ? replySentences : originalSentences;
    target.push(...blockSentences(block, page));
  });

  const original = originalSentences.find((candidate) => candidate.sentence.length >= 45);
  const originalDuplicateWindow = originalSentences.slice(0, 3);
  const reply = replySentences.find(
    (candidate) => {
      if (!original) {
        return true;
      }

      const replyComparable = normalizeComparable(candidate.sentence);

      return !originalDuplicateWindow.some((originalCandidate) => {
        const originalComparable = normalizeComparable(originalCandidate.sentence);
        return originalComparable === replyComparable ||
          sentenceSimilarity(originalCandidate.sentence, candidate.sentence) > 0.8;
      });
    },
  );

  if (original && reply) {
    return [original.sentence, reply.sentence];
  }

  if (original) {
    const fallbackReply = buildBriefCandidates(page, summary, document).find(
      (candidate) => sentenceSimilarity(original.sentence, candidate.sentence) < 0.42,
    );

    return fallbackReply ? [original.sentence, fallbackReply.sentence] : [original.sentence];
  }

  if (reply) {
    return [reply.sentence];
  }

  return selectUniqueBriefSentences(
    page,
    rankBriefCandidates(page, buildBriefCandidates(page, summary, document)),
    2,
  );
}

function trimForBrief(text: string, maxLength: number): string {
  const normalized = normalizeAudioText(text);
  if (normalized.length <= maxLength) {
    return ensureSentence(normalized);
  }

  const shortened = normalized.slice(0, maxLength);
  const lastBreak = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf(", "), shortened.lastIndexOf(" "));
  return ensureSentence(shortened.slice(0, lastBreak > 0 ? lastBreak : maxLength).trim());
}

function joinNaturalList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function inferThreadTension(replyTexts: string[]): string | null {
  const combined = replyTexts.join(" ");
  const positive = /\b(agree|yes|useful|would use|works|good|helpful|exactly)\b/i.test(combined);
  const caution = /\b(but|however|concern|risk|wrong|trust|not sure|depends|problem)\b/i.test(combined);

  if (positive && caution) {
    return "There is some agreement on the idea, but the replies also add caveats and practical constraints.";
  }

  if (caution) {
    return "The replies lean cautious, with people focusing on limits, trust, or edge cases.";
  }

  if (positive) {
    return "The replies mostly build on the original point rather than rejecting it.";
  }

  return null;
}

function buildBriefSentences(page: CleanedPage, summary: SummaryResult): string[] {
  const document = buildAudioDocument(page);

  if (page.pageType === "docs") {
    return buildDocsBrief(page, summary, document);
  }

  if (page.pageType === "thread") {
    return buildThreadBrief(page, summary, document);
  }

  return buildArticleBrief(page, summary, document);
}

export function summarizePage(page: CleanedPage): SummaryResult {
  const document = buildAudioDocument(page);
  const titleTokens = new Set(tokenize(page.title));
  const headingTokens = new Set(page.headings.flatMap((heading) => tokenize(heading)));
  const sentences = sentenceRecordsFromDocument(document)
    .filter((record) => !isLowValueAudioSentence(record.sentence, page.title))
    .map((record) => ({
      ...record,
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
      1 - clamp(record.paragraphIndex / Math.max(1, document.stats.narratableBlockCount), 0, 0.9);
    const lexicalDiversity =
      record.tokens.length > 0 ? new Set(record.tokens).size / record.tokens.length : 0;
    const lengthBonus =
      record.tokens.length >= 8 && record.tokens.length <= 36
        ? 0.5
        : record.tokens.length < 6
          ? -0.35
          : 0;

    return {
      ...record,
      score:
        overlap(record.tokens, titleTokens) * 2.2 +
        overlap(record.tokens, headingTokens) * 1 +
        clamp(tfScore / 18) * 1 +
        positionScore * 0.85 +
        lexicalDiversity * 0.4 +
        lengthBonus,
    } satisfies SentenceRecord;
  });

  const ranked = [...scored].sort((left, right) => right.score - left.score);
  const selected: SentenceRecord[] = [];

  for (const candidate of ranked) {
    const similarity = selected.length
      ? Math.max(...selected.map((current) => jaccardSimilarity(current.sentence, candidate.sentence)))
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
  const shortSummary = ordered.map((record) => record.sentence).join(" ") || page.title;

  const takeaways = ranked
    .filter((candidate) => candidate.sentence.length >= 45)
    .filter((candidate) => !isLowValueAudioSentence(candidate.sentence, page.title))
    .reduce<string[]>((accumulator, candidate) => {
      const isDuplicate = accumulator.some(
        (item) => jaccardSimilarity(item, candidate.sentence) > 0.66,
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
  return buildBriefSentences(page, summary)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildReadTranscript(page: CleanedPage): string {
  if (page.pageType === "thread") {
    return buildThreadReadTranscript(page);
  }

  if (page.pageType === "docs") {
    return buildDocsReadTranscript(page);
  }

  return getNarratableText(page)
    .replace(/\s+/g, " ")
    .trim();
}

function buildDocsReadTranscript(page: CleanedPage): string {
  const document = buildAudioDocument(page);

  return document.narratableBlocks
    .map((block) => {
      if (block.kind === "heading") {
        return `Section: ${block.text}.`;
      }

      return block.text;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildThreadReadTranscript(page: CleanedPage): string {
  if (page.threadModel) {
    const blocks = [page.threadModel.title];

    if (page.threadModel.originalPost?.text) {
      blocks.push("Original post.");
      blocks.push(page.threadModel.originalPost.text);
    }

    if (page.threadModel.replies.length > 0) {
      blocks.push("Top replies.");
      page.threadModel.replies.slice(0, 5).forEach((reply, index) => {
        blocks.push(`Reply ${index + 1}. ${reply.text}`);
      });
    }

    if (page.threadModel.themes?.length) {
      blocks.push(`Common theme in the replies: ${joinNaturalList(page.threadModel.themes.slice(0, 3))}.`);
    }

    return blocks.join(" ").replace(/\s+/g, " ").trim();
  }

  return getNarratableText(page)
    .replace(/\bReply\s+(\d+)\s+from\s+[^.]+?\.\s*/gi, "Reply $1. ")
    .replace(/\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
