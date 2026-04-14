import {
  buildCleanedPage,
  collectHeadings,
  collectOrderedBlocks,
  dedupeStrings,
  htmlFromText,
  normalizeWhitespace,
  parseHtmlDocument,
  pickBestContainer,
  pickFirstText,
  pickTitle,
  removeJunk,
  withinCharBudget,
} from "@/lib/extract/common";
import type { CleanedPage, PagePayload } from "@/lib/types";

function pushUniqueLine(target: string[], line: string | undefined): void {
  if (!line) {
    return;
  }

  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return;
  }

  if (!target.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    target.push(normalized);
  }
}

function isArticleMetadataLine(text: string): boolean {
  return /^(published|updated|last updated)\s*\d/i.test(text) ||
    /^(published|updated|last updated)\s+\d{1,2}\s+[a-z]+\s+\d{4}/i.test(text) ||
    /^[a-z]+\s+\d{1,2},?\s+\d{4}\s*,?\s*\d{1,2}:\d{2}/i.test(text) ||
    /^\d{1,2}\s+[a-z]+\s+\d{4},?\s+\d{1,2}:\d{2}/i.test(text);
}

export function cleanArticle(payload: PagePayload): CleanedPage {
  const html = payload.html || htmlFromText(payload.textContent ?? "", payload.title);
  const document = parseHtmlDocument(html, payload.url);
  const cleanup = removeJunk(document);

  const title = pickTitle(document, payload.title ?? "Untitled article");
  const container = pickBestContainer(document, [
    "article",
    "main",
    "[role='main']",
    ".article-body",
    ".post-content",
    ".entry-content",
    ".story-body",
    ".prose",
    ".content",
  ]);

  const dek = pickFirstText(document, [
    ".subtitle",
    ".standfirst",
    ".dek",
    "[data-testid*='subtitle']",
    "[class*='subtitle']",
  ]);

  const byline = pickFirstText(document, [
    "[rel='author']",
    ".byline",
    "[class*='byline']",
    ".author",
    "[data-testid*='author']",
  ], 3);

  const orderedBlocks = collectOrderedBlocks(container, "h2, h3, p, blockquote, li", {
    minLength: 18,
    map: (element, text) => {
      const tagName = element.tagName.toLowerCase();

      if (tagName === "li") {
        return text.length >= 20 ? `Bullet: ${text}` : null;
      }

      if (tagName === "p" && isArticleMetadataLine(text)) {
        return null;
      }

      if (tagName === "h2" || tagName === "h3") {
        return text;
      }

      return text.length >= 35 ? text : null;
    },
  });

  const textBlocks: string[] = [];
  pushUniqueLine(textBlocks, title);
  pushUniqueLine(textBlocks, dek);
  pushUniqueLine(
    textBlocks,
    byline
      ? byline.toLowerCase().startsWith("by ")
        ? `${byline}.`
        : `By ${byline}.`
      : undefined,
  );

  withinCharBudget(dedupeStrings(orderedBlocks), 15_000).forEach((block) => {
    pushUniqueLine(textBlocks, block);
  });

  return buildCleanedPage({
    title,
    sourceUrl: payload.url,
    pageType: "article",
    textBlocks,
    headings: collectHeadings(container),
    byline,
    cleanup,
    notes: [
      `Article cleaner used a ${container.tagName.toLowerCase()} container for the main body.`,
    ],
  });
}
