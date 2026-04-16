import {
  getElementFingerprint,
  htmlFromText,
  normalizeWhitespace,
  parseHtmlDocument,
  removeJunk,
} from "@/lib/extract/common";
import { detectSourceHints } from "@/lib/source-detection";
import type { ClassificationResult, ClassifierMetrics, PagePayload, PageType } from "@/lib/types";

const THREAD_TERMS = ["comment", "reply", "thread", "discussion", "message", "answer", "tweet"];
const ARTICLE_TERMS = ["article", "story", "post", "entry", "content", "body"];
const DOCS_TERMS = ["docs", "documentation", "sidebar", "toc", "table of contents", "on this page"];
const THREAD_FINGERPRINT_PATTERN =
  /\b(comment|comments|reply|replies|thread|discussion|conversation|message|answer|tweet)\b/;
const AUTHOR_FINGERPRINT_PATTERN = /\b(author|username|user|handle|avatar)\b/;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function countMatchingElements(document: Document, terms: string[]): number {
  return Array.from(document.querySelectorAll("body *")).filter((element) => {
    const fingerprint = getElementFingerprint(element);
    return terms.some((term) => fingerprint.includes(term));
  }).length;
}

function countTimestampSignals(text: string, document: Document): number {
  const textMatches = text.match(
    /\b(\d{1,2}:\d{2}\s?(?:am|pm)?|yesterday|today|\d+\s+(?:minutes?|hours?|days?)\s+ago|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi,
  );

  return (textMatches?.length ?? 0) + document.querySelectorAll("time").length;
}

function countHandles(text: string): number {
  return text.match(/@\w[\w.-]{1,24}/g)?.length ?? 0;
}

function countThreadBlocks(document: Document): number {
  const candidates = Array.from(document.querySelectorAll("article, li, section, div")).sort(
    (left, right) =>
      normalizeWhitespace(left.textContent ?? "").length -
      normalizeWhitespace(right.textContent ?? "").length,
  );
  const selected: Element[] = [];

  for (const element of candidates) {
    const fingerprint = getElementFingerprint(element);
    const text = normalizeWhitespace(element.textContent ?? "");

    if (text.length < 60 || text.length > 1_500) {
      continue;
    }

    const hasThreadContainer = THREAD_FINGERPRINT_PATTERN.test(fingerprint);
    if (!hasThreadContainer) {
      continue;
    }

    const hasConversationText = /\b(reply|replied|commented|comments?|posted|thread|discussion|conversation)\b/i.test(text);
    const hasHandle = /@\w[\w.-]{1,24}/.test(text);
    const hasAuthorElement = Array.from(element.querySelectorAll("*")).some((child) =>
      AUTHOR_FINGERPRINT_PATTERN.test(getElementFingerprint(child)),
    );
    const hasTimestamp = Boolean(element.querySelector("time")) || /\b\d+\s+(minutes?|hours?|days?)\s+ago\b/i.test(text);

    if (!(hasConversationText || hasHandle || hasAuthorElement)) {
      continue;
    }

    if (!hasTimestamp && !hasHandle && !hasAuthorElement) {
      continue;
    }

    const overlaps = selected.some((existing) => existing.contains(element) || element.contains(existing));

    if (!overlaps) {
      selected.push(element);
    }
  }

  return selected.length;
}

function countCompactThreadSignals(document: Document, text: string): number {
  const selectors = [
    "[data-testid*='comment' i]",
    "[data-testid*='reply' i]",
    "[data-testid*='tweet' i]",
    "shreddit-comment",
    ".athing.comtr",
    ".comment",
    ".reply",
    ".answer",
    ".js-comment-container",
    "article[data-testid='tweet']",
  ];
  const selectorHits = document.querySelectorAll(selectors.join(",")).length;
  const scoreHits = text.match(/\b\d+\s+(?:points?|upvotes?|likes?|reposts?|retweets?|answers?|comments?)\b/gi)?.length ?? 0;
  const nestedHits = document.querySelectorAll("[data-depth], [data-level], .ind, .child, .replies").length;

  return selectorHits + scoreHits + nestedHits;
}

function scoreArticle(metrics: ClassifierMetrics): number {
  const longParagraphDensity =
    metrics.paragraphCount > 0 ? metrics.longParagraphCount / metrics.paragraphCount : 0;

  return clamp(
    (metrics.h1Count > 0 ? 0.16 : 0) +
      clamp(longParagraphDensity * 0.42) +
      clamp(metrics.paragraphCount / 8) * 0.16 +
      clamp(metrics.mainContainerHits / 2) * 0.12 +
      clamp(metrics.articleHintHits / 6) * 0.12 +
      (1 - clamp(metrics.commentBlockCount / 8)) * 0.12,
  );
}

function scoreDocs(metrics: ClassifierMetrics): number {
  return clamp(
    clamp(metrics.headingCount / 10) * 0.22 +
      clamp(metrics.codeBlockCount / 4) * 0.24 +
      clamp(metrics.tocClues / 4) * 0.18 +
      clamp(metrics.listCount / 12) * 0.1 +
      metrics.structuredSectionScore * 0.16 +
      clamp(metrics.mainContainerHits / 2) * 0.1,
  );
}

function scoreThread(metrics: ClassifierMetrics): number {
  return clamp(
    clamp(metrics.commentBlockCount / 6) * 0.34 +
      clamp(metrics.usernameHits / 8) * 0.18 +
      clamp(metrics.replyWordHits / 8) * 0.18 +
      metrics.nestedDiscussionScore * 0.18 +
      clamp(metrics.timestampHits / 8) * 0.06 +
      clamp(metrics.headingCount / 6) * 0.06,
  );
}

function buildReasons(pageType: PageType, metrics: ClassifierMetrics): string[] {
  const reasons: string[] = [];

  if (pageType === "article") {
    if (metrics.h1Count > 0) {
      reasons.push("Found a strong top-level headline.");
    }
    if (metrics.longParagraphCount >= 3) {
      reasons.push(`Detected ${metrics.longParagraphCount} long body paragraphs.`);
    }
    if (metrics.commentBlockCount <= 2) {
      reasons.push("Very few repeated reply or comment patterns.");
    }
  }

  if (pageType === "docs") {
    if (metrics.headingCount >= 5) {
      reasons.push(`Detected a structured heading stack with ${metrics.headingCount} headings.`);
    }
    if (metrics.codeBlockCount > 0) {
      reasons.push(`Found ${metrics.codeBlockCount} code block signals.`);
    }
    if (metrics.tocClues > 0) {
      reasons.push("Found sidebar or table-of-contents cues.");
    }
  }

  if (pageType === "thread") {
    if (metrics.commentBlockCount >= 3) {
      reasons.push(`Detected ${metrics.commentBlockCount} repeated discussion blocks.`);
    }
    if (metrics.usernameHits > 0) {
      reasons.push("Found handles or author markers that look like replies.");
    }
    if (metrics.timestampHits > 0) {
      reasons.push("Found timestamps or recency markers across the page.");
    }
  }

  return reasons.length > 0 ? reasons : ["Matched the dominant DOM structure for this page type."];
}

export function classifyPage(payload: PagePayload): ClassificationResult {
  const sourceHints = detectSourceHints(payload);
  const html = payload.html || htmlFromText(payload.textContent ?? "", payload.title);
  const document = parseHtmlDocument(html, payload.url || "https://example.com");
  removeJunk(document);

  const visibleText = normalizeWhitespace(document.body?.textContent ?? payload.textContent ?? "");
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
  const paragraphs = Array.from(document.querySelectorAll("p")).filter(
    (paragraph) => normalizeWhitespace(paragraph.textContent ?? "").length >= 60,
  );
  const longParagraphCount = paragraphs.filter(
    (paragraph) => normalizeWhitespace(paragraph.textContent ?? "").length >= 220,
  ).length;
  const codeBlockCount = document.querySelectorAll("pre, code").length;
  const commentBlockCount = countThreadBlocks(document);
  const tocClues = countMatchingElements(document, DOCS_TERMS);
  const articleHintHits = countMatchingElements(document, ARTICLE_TERMS);
  const mainContainerHits = document.querySelectorAll("main, article, [role='main']").length;
  const listCount = document.querySelectorAll("li").length;
  const usernameHits = countHandles(visibleText) + countMatchingElements(document, ["author", "user", "handle", "avatar"]);
  const timestampHits = countTimestampSignals(visibleText, document);
  const replyWordHits = visibleText.match(/\b(reply|replied|commented|posted|thread|discussion)\b/gi)
    ?.length ?? 0;
  const compactThreadSignals = countCompactThreadSignals(document, visibleText);

  const threadBlocks = Array.from(document.querySelectorAll("article, li, section, div")).filter(
    (element) => {
      const fingerprint = getElementFingerprint(element);
      const text = normalizeWhitespace(element.textContent ?? "");
      return (
        text.length >= 80 &&
        THREAD_FINGERPRINT_PATTERN.test(fingerprint) &&
        (/@\w[\w.-]{1,24}/.test(text) ||
          /\b(reply|replied|commented|comments?|posted|thread|discussion|conversation)\b/i.test(text))
      );
    },
  );

  const nestedDiscussionScore = clamp(
    threadBlocks.filter((element) =>
      Array.from(element.children).some((child) => THREAD_TERMS.some((term) => getElementFingerprint(child).includes(term))),
    ).length / 4,
  );

  const structuredSectionScore = clamp(
    (headings.length / Math.max(1, paragraphs.length)) * 0.9 +
      clamp(codeBlockCount / 4) * 0.5 +
      clamp(listCount / 10) * 0.3,
  );

  const metrics: ClassifierMetrics = {
    h1Count: document.querySelectorAll("h1").length,
    headingCount: headings.length,
    paragraphCount: paragraphs.length,
    longParagraphCount,
    listCount,
    codeBlockCount,
    mainContainerHits,
    articleHintHits,
    tocClues,
    commentBlockCount,
    usernameHits,
    timestampHits,
    replyWordHits,
    structuredSectionScore,
    nestedDiscussionScore,
  };

  const scores: Record<PageType, number> = {
    article: scoreArticle(metrics),
    docs: scoreDocs(metrics),
    thread: scoreThread(metrics),
  };

  if (sourceHints.pageIntentHint === "thread") {
    scores.thread = clamp(scores.thread + 0.32);
    scores.article = clamp(scores.article - 0.14);
  }

  if (sourceHints.pageIntentHint === "docs") {
    scores.docs = clamp(scores.docs + 0.28);
    scores.article = clamp(scores.article - 0.08);
  }

  if (sourceHints.sourceKind === "pdf") {
    scores.docs = clamp(scores.docs + 0.42);
    scores.article = clamp(scores.article - 0.16);
    scores.thread = clamp(scores.thread - 0.18);
  }

  if (["reddit", "x", "hackernews", "github", "stackoverflow"].includes(sourceHints.hostFamily)) {
    scores.thread = clamp(scores.thread + 0.16);
    if (sourceHints.pageIntentHint === "thread") {
      scores.thread = clamp(scores.thread + 0.16);
    }
  }

  if (metrics.commentBlockCount >= 3 && (metrics.usernameHits >= 2 || metrics.replyWordHits >= 2)) {
    scores.thread = clamp(scores.thread + 0.18);
    scores.article = clamp(scores.article - 0.1);
  }

  if ((metrics.commentBlockCount >= 4 && metrics.replyWordHits >= 1) || compactThreadSignals >= 4) {
    scores.thread = clamp(scores.thread + 0.12);
    scores.article = clamp(scores.article - 0.06);
  }

  if (
    metrics.commentBlockCount === 0 &&
    compactThreadSignals < 3 &&
    sourceHints.pageIntentHint !== "thread" &&
    metrics.paragraphCount >= 3 &&
    metrics.h1Count > 0
  ) {
    scores.article = clamp(scores.article + 0.12);
    scores.thread = clamp(scores.thread - 0.18);
  }

  if (
    sourceHints.pageIntentHint === "thread" &&
    scores.article > scores.thread &&
    scores.article - scores.thread < 0.28
  ) {
    scores.thread = clamp(scores.article + 0.03);
  }

  if (
    sourceHints.sourceKind === "pdf" &&
    scores.article > scores.docs &&
    scores.article - scores.docs < 0.38
  ) {
    scores.docs = clamp(scores.article + 0.04);
  }

  const sorted = Object.entries(scores).sort((left, right) => right[1] - left[1]) as Array<
    [PageType, number]
  >;
  const [pageType, topScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? 0;
  const confidence = clamp(0.55 + (topScore - secondScore) * 0.55, 0.55, 0.97);

  return {
    pageType,
    confidence: Number(confidence.toFixed(2)),
    reasons: [
      sourceHints.matchedRule ? `Source hint: ${sourceHints.matchedRule}.` : undefined,
      ...buildReasons(pageType, metrics),
    ].filter((reason): reason is string => Boolean(reason)),
    metrics,
    scores,
    sourceHints,
  };
}
