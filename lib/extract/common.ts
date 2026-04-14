import { JSDOM } from "jsdom";
import type { CleanedPage, ExtractionDebug, PageType } from "@/lib/types";

const BASE_JUNK_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "footer",
  "aside",
  "[role='navigation']",
  "[role='contentinfo']",
  "[aria-label*='cookie']",
  "[aria-label*='consent']",
  "[data-testid*='cookie']",
  "[data-testid*='sidebar']",
  "[data-testid*='newsletter']",
  "[id*='cookie']",
  "[class*='cookie']",
  "[class*='consent']",
  "[class*='newsletter']",
  "[class*='signup']",
  "[class*='subscribe']",
  "[class*='advert']",
  "[class*='promo']",
  "[class*='related']",
  "[class*='recommend']",
];

const KEYWORD_REMOVALS = [
  "cookie",
  "consent",
  "subscribe",
  "newsletter",
  "sign up",
  "advertisement",
  "sponsored",
  "related stories",
  "recommended",
  "share this",
];

export interface CleanupResult {
  removedCount: number;
  removedSelectors: string[];
  notes: string[];
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function htmlFromText(text: string, title = "Untitled page"): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");

  return `<main><h1>${escapeHtml(title)}</h1>${paragraphs}</main>`;
}

export function parseHtmlDocument(html: string, sourceUrl: string): Document {
  const dom = new JSDOM(html, {
    url: sourceUrl,
    contentType: "text/html",
  });

  return dom.window.document;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeLineBreaks(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function estimateReadingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 190));
}

export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const normalized = normalizeWhitespace(item).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalizeWhitespace(item));
  }

  return output;
}

export function getElementFingerprint(element: Element): string {
  return [
    element.tagName.toLowerCase(),
    element.id,
    element.getAttribute("class") ?? "",
    element.getAttribute("role") ?? "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("data-testid") ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function removeJunk(document: Document): CleanupResult {
  const removedSelectors = new Set<string>();
  const notes: string[] = [];
  let removedCount = 0;

  for (const selector of BASE_JUNK_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length === 0) {
      continue;
    }

    for (const node of nodes) {
      node.remove();
      removedCount += 1;
    }

    removedSelectors.add(selector);
  }

  const keywordNodes = Array.from(document.body?.querySelectorAll("*") ?? []).filter(
    (node) => {
      const fingerprint = getElementFingerprint(node);
      const text = normalizeWhitespace(node.textContent ?? "");

      if (text.length > 500) {
        return false;
      }

      return KEYWORD_REMOVALS.some(
        (keyword) => fingerprint.includes(keyword) || text.toLowerCase().includes(keyword),
      );
    },
  );

  for (const node of keywordNodes) {
    node.remove();
    removedCount += 1;
  }

  if (removedSelectors.size > 0) {
    notes.push("Removed navigation, forms, and peripheral page chrome.");
  }

  if (keywordNodes.length > 0) {
    notes.push("Removed cookie prompts, promos, and newsletter-style blocks.");
  }

  return {
    removedCount,
    removedSelectors: Array.from(removedSelectors),
    notes,
  };
}

export function pickTitle(document: Document, fallback = "Untitled page"): string {
  const titleCandidates = [
    document.querySelector("meta[property='og:title']")?.getAttribute("content"),
    document.querySelector("h1")?.textContent,
    document.querySelector("title")?.textContent,
    fallback,
  ];

  return (
    titleCandidates
      .map((candidate) => normalizeWhitespace(candidate ?? ""))
      .find(Boolean) ?? fallback
  );
}

export function collectHeadings(root: ParentNode): string[] {
  return dedupeStrings(
    Array.from(root.querySelectorAll("h1, h2, h3, h4"))
      .map((heading) => normalizeWhitespace(heading.textContent ?? ""))
      .filter((heading) => heading.length > 2),
  );
}

export function pickFirstText(
  root: ParentNode,
  selectors: string[],
  minLength = 8,
): string | undefined {
  for (const selector of selectors) {
    const candidate = root.querySelector(selector);
    if (!candidate) {
      continue;
    }

    const text = normalizeWhitespace(candidate.textContent ?? "");
    if (text.length >= minLength) {
      return text;
    }
  }

  return undefined;
}

export function scoreContainer(element: Element): number {
  const textLength = normalizeWhitespace(element.textContent ?? "").length;
  const paragraphs = element.querySelectorAll("p").length;
  const headings = element.querySelectorAll("h1, h2, h3").length;
  const lists = element.querySelectorAll("li").length;
  const codeBlocks = element.querySelectorAll("pre, code").length;
  const fingerprint = getElementFingerprint(element);
  const penalty = /(nav|menu|footer|header|promo|related|share)/.test(fingerprint)
    ? 0.4
    : 0;

  return (
    textLength / 1000 +
    paragraphs * 0.22 +
    headings * 0.16 +
    lists * 0.06 +
    codeBlocks * 0.05 -
    penalty
  );
}

export function pickBestContainer(
  document: Document,
  selectors: string[],
): Element {
  const candidates = dedupeElements(
    selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
  );

  if (candidates.length === 0) {
    return document.body ?? document.documentElement;
  }

  return candidates.sort((left, right) => scoreContainer(right) - scoreContainer(left))[0];
}

export function dedupeElements(elements: Element[]): Element[] {
  const seen = new Set<Element>();
  const output: Element[] = [];

  for (const element of elements) {
    if (seen.has(element)) {
      continue;
    }

    seen.add(element);
    output.push(element);
  }

  return output;
}

export function collectTextBlocks(
  root: ParentNode,
  selectors: string[],
  options?: {
    minLength?: number;
    map?: (element: Element, text: string) => string | null;
  },
): string[] {
  const output: string[] = [];
  const minLength = options?.minLength ?? 12;

  for (const selector of selectors) {
    const nodes = Array.from(root.querySelectorAll(selector));

    for (const node of nodes) {
      const text = normalizeWhitespace(node.textContent ?? "");
      if (text.length < minLength) {
        continue;
      }

      const mapped = options?.map ? options.map(node, text) : text;
      if (mapped) {
        output.push(mapped);
      }
    }
  }

  return dedupeStrings(output);
}

export function collectOrderedBlocks(
  root: ParentNode,
  selector: string,
  options?: {
    minLength?: number;
    map?: (element: Element, text: string) => string | null;
  },
): string[] {
  const minLength = options?.minLength ?? 12;

  return Array.from(root.querySelectorAll(selector))
    .map((node) => {
      const text = normalizeWhitespace(node.textContent ?? "");
      if (text.length < minLength) {
        return null;
      }

      return options?.map ? options.map(node, text) : text;
    })
    .filter((value): value is string => Boolean(value));
}

export function withinCharBudget(items: string[], maxChars: number): string[] {
  const output: string[] = [];
  let total = 0;

  for (const item of items) {
    const nextTotal = total + item.length + 2;
    if (nextTotal > maxChars && output.length > 0) {
      break;
    }

    output.push(item);
    total = nextTotal;
  }

  return output;
}

export function buildCleanedPage(params: {
  title: string;
  sourceUrl: string;
  pageType: PageType;
  textBlocks: string[];
  headings: string[];
  byline?: string;
  cleanup: CleanupResult;
  notes?: string[];
}): CleanedPage {
  const combined = normalizeLineBreaks(params.textBlocks.join("\n\n"));
  const debug: ExtractionDebug = {
    headings: params.headings,
    removedSelectors: params.cleanup.removedSelectors,
    removedCount: params.cleanup.removedCount,
    notes: [...params.cleanup.notes, ...(params.notes ?? [])],
    segmentCount: params.textBlocks.length,
  };

  return {
    title: params.title,
    sourceUrl: params.sourceUrl,
    pageType: params.pageType,
    cleanedText: combined,
    charCount: combined.length,
    estimatedReadingTime: estimateReadingTime(combined),
    headings: params.headings,
    byline: params.byline,
    debug,
  };
}
