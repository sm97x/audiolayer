import {
  buildCleanedPage,
  collectHeadings,
  collectOrderedBlocks,
  getElementFingerprint,
  htmlFromText,
  normalizeWhitespace,
  parseHtmlDocument,
  pickBestContainer,
  pickFirstText,
  pickTitle,
  removeJunk,
  withinCharBudget,
} from "@/lib/extract/common";
import {
  extractThreadModelWithProfiles,
  threadProfileNotes,
} from "@/lib/site-profiles";
import { detectSourceHints } from "@/lib/source-detection";
import { threadModelToTextBlocks } from "@/lib/thread-model";
import type { CleanedPage, PagePayload } from "@/lib/types";

interface ReplyCandidate {
  element: Element;
  text: string;
  author?: string;
  timestamp?: string;
  score: number;
  order: number;
}

function scoreReplyCandidate(element: Element, text: string): number {
  const fingerprint = getElementFingerprint(element);
  let score = 0;

  if (/(comment|reply|thread|discussion|message|answer|tweet|timeline)/.test(fingerprint)) {
    score += 1;
  }

  if (element.querySelector("time")) {
    score += 0.5;
  }

  if (/@\w[\w.-]{1,24}/.test(text)) {
    score += 0.35;
  }

  if (/\b(reply|commented|posted|said|mentions?)\b/i.test(text)) {
    score += 0.3;
  }

  if (text.length >= 80 && text.length <= 900) {
    score += 0.4;
  }

  if (element.querySelectorAll("p, li").length >= 1) {
    score += 0.25;
  }

  return score;
}

function extractReplyCandidates(document: Document): ReplyCandidate[] {
  const elements = Array.from(document.querySelectorAll("article, li, section, div"));
  const candidates = elements
    .map((element, order) => {
      const text = normalizeWhitespace(element.textContent ?? "");
      if (text.length < 70 || text.length > 1_200) {
        return null;
      }

      const score = scoreReplyCandidate(element, text);
      if (score < 1) {
        return null;
      }

      const author = pickFirstText(element, [
        "[rel='author']",
        ".author",
        ".username",
        ".handle",
        "[class*='author']",
        "[class*='user']",
      ], 2);

      const timestamp = normalizeWhitespace(
        element.querySelector("time")?.textContent ?? "",
      );

      const candidate: ReplyCandidate = {
        element,
        text,
        author,
        timestamp: timestamp || undefined,
        score,
        order,
      };

      return candidate;
    })
    .filter((candidate): candidate is ReplyCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.order - right.order);

  const selected: ReplyCandidate[] = [];

  for (const candidate of candidates) {
    const overlaps = selected.some(
      (existing) =>
        existing.element.contains(candidate.element) || candidate.element.contains(existing.element),
    );

    if (!overlaps) {
      selected.push(candidate);
    }

    if (selected.length >= 8) {
      break;
    }
  }

  return selected.sort((left, right) => left.order - right.order);
}

function replyLabel(candidate: ReplyCandidate, index: number): string {
  if (candidate.author) {
    return candidate.timestamp
      ? `Reply ${index + 1} from ${candidate.author} at ${candidate.timestamp}`
      : `Reply ${index + 1} from ${candidate.author}`;
  }

  return candidate.timestamp
    ? `Reply ${index + 1} at ${candidate.timestamp}`
    : `Reply ${index + 1}`;
}

export function cleanThread(payload: PagePayload): CleanedPage {
  const html = payload.html || htmlFromText(payload.textContent ?? "", payload.title);
  const document = parseHtmlDocument(html, payload.url);
  const sourceHints = detectSourceHints(payload);
  const cleanup = removeJunk(document);
  const title = pickTitle(document, payload.title ?? "Untitled discussion thread");

  const container = pickBestContainer(document, [
    ".thread",
    ".discussion",
    "[data-testid*='thread']",
    "[data-testid*='conversation']",
    "main",
    "[role='main']",
    "article",
    ".content",
  ]);

  const profiledThreadModel = extractThreadModelWithProfiles(
    document,
    payload.title,
    payload.url,
    sourceHints,
  );

  if (profiledThreadModel) {
    return buildCleanedPage({
      title: profiledThreadModel.title || title,
      sourceUrl: payload.url,
      pageType: "thread",
      textBlocks: withinCharBudget(threadModelToTextBlocks(profiledThreadModel), 14_000),
      headings: collectHeadings(container),
      sourceHints,
      threadModel: profiledThreadModel,
      cleanup,
      notes: threadProfileNotes(sourceHints, profiledThreadModel),
    });
  }

  const leadParagraphs = collectOrderedBlocks(container, "p, blockquote, li", {
    minLength: 30,
    map: (_element, text) => text,
  });

  const replyCandidates = extractReplyCandidates(document);
  const topReplies = replyCandidates.slice(0, 5);

  const originalPost = withinCharBudget(leadParagraphs, 900)
    .filter((paragraph) => !topReplies.some((reply) => reply.text === paragraph))
    .slice(0, 3)
    .join(" ");

  const textBlocks: string[] = [title];

  if (originalPost) {
    textBlocks.push("Original post.");
    textBlocks.push(originalPost);
  } else if (topReplies[0]) {
    textBlocks.push("Original post.");
    textBlocks.push(topReplies[0].text);
  }

  if (topReplies.length > 0) {
    textBlocks.push("Top replies.");

    topReplies.forEach((reply, index) => {
      textBlocks.push(`${replyLabel(reply, index)}. ${reply.text}`);
    });
  }

  return buildCleanedPage({
    title,
    sourceUrl: payload.url,
    pageType: "thread",
    textBlocks: withinCharBudget(textBlocks, 12_000),
    headings: collectHeadings(container),
    sourceHints,
    cleanup,
    notes: [
      `Used generic thread fallback for ${sourceHints.hostFamily}.`,
      `Thread cleaner retained ${topReplies.length} reply blocks after de-duplication.`,
    ],
  });
}
