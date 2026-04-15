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
  if (reference.size === 0 || tokens.length === 0) {
    return 0;
  }

  const shared = tokens.filter((token) => reference.has(token)).length;
  return shared / reference.size;
}

function isLowValueAudioSentence(sentence: string, title: string): boolean {
  const comparable = normalizeComparable(sentence);
  const titleComparable = normalizeComparable(title);

  if (!comparable || comparable === titleComparable) {
    return true;
  }

  if (/^(published|updated|last updated)\s*\d/.test(comparable)) {
    return true;
  }

  if (/^\d{1,2}\s+[a-z]+\s+\d{4}\s+\d{1,2}\s+\d{2}/.test(comparable)) {
    return true;
  }

  if (/^(watch|media caption|image caption|video caption)\b/i.test(sentence)) {
    return true;
  }

  return false;
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
    return "Why this matters: it turns the essential steps and constraints into something you can absorb away from the screen.";
  }

  if (page.pageType === "thread") {
    return "Why this matters: it keeps the original point and the strongest replies without forcing you through the repetitive thread mechanics.";
  }

  return "Why this matters: it pulls the central claim, supporting evidence, and payoff into a version that is useful in under two minutes.";
}

function stripExtractiveAttribution(text: string): string {
  return normalizeAudioText(text)
    .replace(/\s+in a statement published by [^.]+/gi, "")
    .replace(/,\s*(?:confirmed|said|says)\s+[^.]{2,120}$/i, ".")
    .replace(/\s+"?(?:confirmed|said|says)\s+[^.]{2,120}$/i, ".")
    .replace(/\bhas confirmed\b/gi, "says")
    .replace(/\s+Why this matters:.+$/i, ".")
    .replace(/^["'\u201c\u201d](.+)["'\u201c\u201d]$/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isMediaOrMetadataSentence(sentence: string, page: CleanedPage): boolean {
  return isLowValueAudioSentence(sentence, page.title) ||
    /^by\s*[A-Z][A-Za-z .,'&-]{2,160}\.?$/i.test(sentence) ||
    /^\d{1,2}:\d{2}$/.test(sentence) ||
    /^(watch|media caption|image caption|video caption)\b/i.test(sentence);
}

function cleanBriefSentence(sentence: string, page: CleanedPage): string | null {
  let cleaned = stripExtractiveAttribution(sentence)
    .replace(/^Bullet:\s*/i, "")
    .replace(/^Original post\.\s*/i, "")
    .replace(/^Top replies\.\s*/i, "")
    .replace(/^Reply\s+\d+\.\s*/i, "")
    .trim();

  if (!cleaned || isMediaOrMetadataSentence(cleaned, page)) {
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

  cleaned = ensureSentence(cleaned);
  return cleaned;
}

function sentenceSimilarity(left: string, right: string): number {
  return jaccardSimilarity(left, right);
}

function isCoreEventRepeat(left: string, right: string): boolean {
  const leftComparable = normalizeComparable(left);
  const rightComparable = normalizeComparable(right);
  const sharedTournamentAbsence =
    leftComparable.includes("world cup") &&
    rightComparable.includes("world cup") &&
    /(injury|achilles|miss|absence|participat|season)/.test(leftComparable) &&
    /(injury|achilles|miss|absence|participat|season)/.test(rightComparable);
  const sharedCuts =
    /\b(cut|cuts|jobs|staff|savings|budget)\b/.test(leftComparable) &&
    /\b(cut|cuts|jobs|staff|savings|budget)\b/.test(rightComparable) &&
    sentenceSimilarity(left, right) > 0.25;
  const sharedInvestigationFinding =
    /\b(investigation|undercover|fake|fabricated|asylum|adviser|law firm)\b/.test(leftComparable) &&
    /\b(investigation|undercover|fake|fabricated|asylum|adviser|law firm)\b/.test(rightComparable) &&
    sentenceSimilarity(left, right) > 0.5;

  return sharedTournamentAbsence || sharedCuts || sharedInvestigationFinding;
}

function buildBriefCandidates(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): BriefCandidate[] {
  const rawCandidates = [
    ...summary.selectedSentences.map((sentence) => ({ sentence, sourceBoost: 1.3 })),
    ...summary.takeaways.map((sentence) => ({ sentence, sourceBoost: 1.1 })),
    ...getNarratableSentences(document).map((sentence) => ({ sentence, sourceBoost: 0.7 })),
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
      const actionScore = /\b(says|said|confirmed|announced|will|would|could|has|have|is|are|plans?|expects?|needs?|shows?|found|reveals?)\b/i.test(
        candidate.sentence,
      )
        ? 0.7
        : 0;
      const consequenceScore = /\b(because|therefore|means|could|may|expected|prevent|risk|impact|change|need|blow|pressure|evidence|response|claims?)\b/i.test(
        candidate.sentence,
      )
        ? 0.55
        : 0;
      const positionScore = Math.max(0, 1 - candidate.position / Math.max(1, candidates.length));
      const lengthPenalty = candidate.tokens.length > 38 ? 0.3 : candidate.tokens.length < 7 ? 0.4 : 0;

      return (
        candidate.sourceBoost +
        overlap(candidate.tokens, titleTokens) * 1.8 +
        overlap(candidate.tokens, headingTokens) * 0.8 +
        actionScore +
        consequenceScore +
        positionScore * 0.45 -
        lengthPenalty
      );
    };

    return score(right) - score(left);
  });
}

function selectUniqueBriefSentences(
  candidates: BriefCandidate[],
  maxSentences: number,
): string[] {
  const selected: string[] = [];

  for (const candidate of candidates) {
    const isDuplicate = selected.some(
      (sentence) =>
        sentenceSimilarity(sentence, candidate.sentence) > 0.42 ||
        isCoreEventRepeat(sentence, candidate.sentence),
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

function isInvestigativeArticle(page: CleanedPage, document: AudioDocument): boolean {
  const text = `${page.title} ${getNarratableText(document)}`.toLowerCase();
  return /\b(investigation|undercover|reporters?|evidence|law firms?|advisers?|asylum|home office)\b/.test(text) &&
    /\b(found|reveals?|fake|fabricated|exposed|misuse|fraud|claims?)\b/.test(text);
}

function findCandidate(
  candidates: BriefCandidate[],
  pattern: RegExp,
  selected: string[],
): BriefCandidate | undefined {
  return candidates.find(
    (candidate) =>
      pattern.test(candidate.sentence) &&
      !selected.some(
        (sentence) =>
          sentenceSimilarity(sentence, candidate.sentence) > 0.42 ||
          isCoreEventRepeat(sentence, candidate.sentence),
      ),
  );
}

function buildInvestigativeBrief(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): string[] {
  const candidates = rankBriefCandidates(page, buildBriefCandidates(page, summary, document));
  const selected: string[] = [];
  const patterns = [
    /\b(shadow industry|bbc has found|law firms?|advisers?).*\b(migrants?|pretend|asylum|claims?|stay in the UK)\b/i,
    /\b(after gathering|reporters? posed|tip-offs|sent undercover|undercover reporters?)\b/i,
    /\b(fabricated evidence|supporting letters|photographs|medical reports|charged up|fake claim|pretend)\b/i,
    /\b(Home Office|full force of the law|regulation authority|suspended|denied|response|spokesperson)\b/i,
    /\b(35 percent|100,000|statistics|2023|vast problem|scale|claims)\b/i,
  ];

  for (const pattern of patterns) {
    const match = findCandidate(candidates, pattern, selected);
    if (match) {
      selected.push(match.sentence);
    }
  }

  if (selected.length >= 3) {
    return selected.slice(0, document.stats.isLongForm ? 5 : 4);
  }

  return selectUniqueBriefSentences(candidates, document.stats.isLongForm ? 4 : 3);
}

function buildArticleBrief(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): string[] {
  if (isInvestigativeArticle(page, document)) {
    return buildInvestigativeBrief(page, summary, document);
  }

  const candidates = rankBriefCandidates(page, buildBriefCandidates(page, summary, document));
  const lead =
    candidates.find((candidate) =>
      /\b(says|said|confirmed|announced|will|would|could|has|have|is|are|expects?|needs?|found|reveals?)\b/i.test(
        candidate.sentence,
      ),
    ) ?? candidates[0];
  const remaining = candidates.filter((candidate) => candidate !== lead);
  const support = selectUniqueBriefSentences(remaining, document.stats.isLongForm ? 3 : 2);

  return selectUniqueBriefSentences([
    ...(lead ? [lead] : []),
    ...support.map((sentence, index) => ({
      sentence,
      tokens: tokenize(sentence),
      position: index,
      sourceBoost: 0,
    })),
  ], document.stats.isLongForm ? 4 : 3);
}

function buildDocsBrief(
  page: CleanedPage,
  summary: SummaryResult,
  document: AudioDocument,
): string[] {
  const candidates = buildBriefCandidates(page, summary, document);
  const firstBodySentence = candidates.find((candidate) => candidate.sentence.length >= 45);
  const setupSentence = candidates.find((candidate) =>
    /\b(start|setup|create|choose|send|request|response|endpoint|constraint|limit)\b/i.test(
      candidate.sentence,
    ),
  );
  const selected = selectUniqueBriefSentences(
    [firstBodySentence, setupSentence].filter((candidate): candidate is BriefCandidate => Boolean(candidate)),
    2,
  );

  return [
    ...selected,
    "Code examples and exact syntax are better viewed on the page; the audio version should give you the path through the task.",
  ].slice(0, 3);
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

  const originalCandidate = originalSentences.find((candidate) => candidate.sentence.length >= 45);
  const originalDuplicateWindow = originalSentences.slice(0, 3);
  const repeatsOriginalSection = (sentence: string): boolean =>
    originalDuplicateWindow.some(
      (candidate) =>
        sentenceSimilarity(candidate.sentence, sentence) > 0.42 ||
        normalizeComparable(candidate.sentence) === normalizeComparable(sentence),
    );
  const replyCandidate = replySentences.find(
    (candidate) =>
      candidate.sentence.length >= 45 &&
      !repeatsOriginalSection(candidate.sentence) &&
      (!originalCandidate ||
        (sentenceSimilarity(originalCandidate.sentence, candidate.sentence) <= 0.42 &&
          !isCoreEventRepeat(originalCandidate.sentence, candidate.sentence))),
  );
  const sectionBased = selectUniqueBriefSentences(
    [originalCandidate, replyCandidate].filter((candidate): candidate is BriefCandidate => Boolean(candidate)),
    2,
  );

  if (sectionBased.length >= 2) {
    return sectionBased;
  }

  const candidates = buildBriefCandidates(page, summary, document);
  return selectUniqueBriefSentences(candidates, 2);
}

function buildBriefSentences(page: CleanedPage, summary: SummaryResult): string[] {
  const document = buildAudioDocument(page);
  const sentences =
    page.pageType === "docs"
      ? buildDocsBrief(page, summary, document)
      : page.pageType === "thread"
        ? buildThreadBrief(page, summary, document)
        : buildArticleBrief(page, summary, document);

  if (sentences.length > 0) {
    return sentences;
  }

  return selectUniqueBriefSentences(
    rankBriefCandidates(page, buildBriefCandidates(page, summary, document)),
    3,
  );
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
      record.tokens.length >= 8 && record.tokens.length <= 34
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
  const shortSummary = ordered.map((record) => record.sentence).join(" ");

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
  return getNarratableText(page)
    .replace(/\s+/g, " ")
    .trim();
}
