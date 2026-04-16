import {
  buildCleanedPage,
  collectHeadings,
  collectOrderedBlocks,
  htmlFromText,
  normalizeWhitespace,
  parseHtmlDocument,
  pickBestContainer,
  pickTitle,
  removeJunk,
  withinCharBudget,
} from "@/lib/extract/common";
import { detectSourceHints } from "@/lib/source-detection";
import type { CleanedPage, PagePayload } from "@/lib/types";

const CODE_PLACEHOLDER = "Code example omitted from audio version.";
const TABLE_PLACEHOLDER = "A data table was omitted from the audio version.";

function appendDocBlock(target: string[], line: string | null): void {
  if (!line) {
    return;
  }

  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return;
  }

  const shouldDeduplicate = normalized !== CODE_PLACEHOLDER && normalized !== TABLE_PLACEHOLDER;
  if (shouldDeduplicate) {
    const exists = target.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      return;
    }
  }

  target.push(normalized);
}

export function cleanDocs(payload: PagePayload): CleanedPage {
  const html = payload.html || htmlFromText(payload.textContent ?? "", payload.title);
  const document = parseHtmlDocument(html, payload.url);
  const sourceHints = detectSourceHints(payload);
  const cleanup = removeJunk(document);
  const title = pickTitle(document, payload.title ?? "Untitled documentation page");

  const container = pickBestContainer(document, [
    ".theme-doc-markdown",
    ".markdown-body",
    ".docs-content",
    ".documentation",
    "[data-docs-content]",
    "main",
    "article",
    "[role='main']",
    ".content",
  ]);

  const rawBlocks = collectOrderedBlocks(container, "h1, h2, h3, h4, p, li, pre, code, table", {
    minLength: 2,
    map: (element, text) => {
      const tagName = element.tagName.toLowerCase();

      if (tagName === "pre") {
        return CODE_PLACEHOLDER;
      }

      if (tagName === "code" && element.parentElement?.tagName.toLowerCase() === "pre") {
        return null;
      }

      if (tagName === "table") {
        return TABLE_PLACEHOLDER;
      }

      if (tagName === "li") {
        return text.length >= 8 ? `Bullet: ${text}` : null;
      }

      if (tagName.startsWith("h")) {
        return text;
      }

      if (tagName === "code") {
        return text.length >= 4 && text.length <= 42 ? `Inline code: ${text}` : CODE_PLACEHOLDER;
      }

      return text.length >= 20 ? text : null;
    },
  });

  const textBlocks: string[] = [title];
  for (const block of withinCharBudget(rawBlocks, 16_000)) {
    appendDocBlock(textBlocks, block);
  }

  return buildCleanedPage({
    title,
    sourceUrl: payload.url,
    pageType: "docs",
    textBlocks,
    headings: collectHeadings(container),
    sourceHints,
    cleanup,
    notes: [
      `Docs cleaner used a ${container.tagName.toLowerCase()} container and preserved section structure for audio.`,
    ],
  });
}
