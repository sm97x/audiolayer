import { htmlFromText, normalizeWhitespace, parseHtmlDocument } from "@/lib/extract/common";
import type { HostFamily, PageIntentHint, PagePayload, SourceHints, SourceKind } from "@/lib/types";

function safeUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function detectHostFamily(hostname: string): HostFamily {
  const host = hostname.toLowerCase().replace(/^www\./, "");

  if (host.endsWith("bbc.co.uk") || host.endsWith("bbc.com")) {
    return "bbc";
  }

  if (host.endsWith("reddit.com") || host.endsWith("old.reddit.com")) {
    return "reddit";
  }

  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
    return "x";
  }

  if (host === "news.ycombinator.com") {
    return "hackernews";
  }

  if (host === "github.com") {
    return "github";
  }

  if (host === "stackoverflow.com" || host.endsWith(".stackoverflow.com")) {
    return "stackoverflow";
  }

  return "generic";
}

function detectPdf(url: URL | undefined, payload: PagePayload, text: string): {
  sourceKind: SourceKind;
  matchedRule?: string;
} {
  if (payload.sourceHints?.sourceKind === "pdf") {
    return { sourceKind: "pdf", matchedRule: "payload sourceKind=pdf" };
  }

  if (url?.pathname.toLowerCase().endsWith(".pdf")) {
    return { sourceKind: "pdf", matchedRule: "url path ends with .pdf" };
  }

  if (/^%PDF-\d\.\d/.test(payload.textContent ?? "")) {
    return { sourceKind: "pdf", matchedRule: "payload contains PDF header" };
  }

  if (/\b(application\/pdf|pdf viewer|chrome-extension:\/\/mhjfbmdgcfjbbpaeojofohoefgiehjai)\b/i.test(text)) {
    return { sourceKind: "pdf", matchedRule: "pdf viewer marker" };
  }

  return { sourceKind: "html" };
}

function detectUrlIntent(url: URL | undefined, hostFamily: HostFamily): {
  pageIntentHint: PageIntentHint;
  matchedRule?: string;
} {
  const pathname = url?.pathname.toLowerCase() ?? "";
  const search = url?.search.toLowerCase() ?? "";

  if (hostFamily === "reddit" && /\/comments\//.test(pathname)) {
    return { pageIntentHint: "thread", matchedRule: "reddit comments URL" };
  }

  if (hostFamily === "x" && /\/status\/\d+/.test(pathname)) {
    return { pageIntentHint: "thread", matchedRule: "x/twitter status URL" };
  }

  if (hostFamily === "hackernews" && pathname === "/item" && search.includes("id=")) {
    return { pageIntentHint: "thread", matchedRule: "hacker news item URL" };
  }

  if (hostFamily === "github" && /\/(?:issues|discussions)\/\d+/.test(pathname)) {
    return { pageIntentHint: "thread", matchedRule: "github issue/discussion URL" };
  }

  if (hostFamily === "stackoverflow" && /\/questions\/\d+/.test(pathname)) {
    return { pageIntentHint: "thread", matchedRule: "stackoverflow question URL" };
  }

  if (pathname.endsWith(".pdf")) {
    return { pageIntentHint: "docs", matchedRule: "pdf URL" };
  }

  if (/\/(?:docs|documentation|reference|guide|api)\b/.test(pathname)) {
    return { pageIntentHint: "docs", matchedRule: "docs URL path" };
  }

  return { pageIntentHint: "unknown" };
}

function detectDomIntent(payload: PagePayload, text: string): {
  pageIntentHint: PageIntentHint;
  matchedRule?: string;
} {
  const html = payload.html || htmlFromText(payload.textContent ?? "", payload.title);
  const document = parseHtmlDocument(html, payload.url || "https://example.com");
  const lowerText = text.toLowerCase();
  const threadSelectors = document.querySelectorAll(
    [
      "[data-testid*='comment' i]",
      "[data-testid*='reply' i]",
      "[data-testid*='tweet' i]",
      "[class*='comment' i]",
      "[class*='reply' i]",
      "[class*='Comment' i]",
      "[class*='Reply' i]",
      ".athing",
      ".comment",
      ".js-comment",
      "[role='article']",
    ].join(","),
  ).length;
  const docsSelectors = document.querySelectorAll(
    [
      "pre",
      "code",
      "[class*='toc' i]",
      "[class*='sidebar' i]",
      "[aria-label*='table of contents' i]",
      "[data-testid*='toc' i]",
    ].join(","),
  ).length;
  const handleMatches = text.match(/@\w[\w.-]{1,24}/g)?.length ?? 0;
  const timeMatches = text.match(/\b\d+\s+(?:minutes?|hours?|days?|months?|years?)\s+ago\b/gi)?.length ?? 0;

  if (
    threadSelectors >= 3 ||
    (handleMatches >= 3 && timeMatches >= 2) ||
    /\b(upvoted|downvoted|comments sorted by|view discussions?|continue this thread)\b/i.test(text)
  ) {
    return { pageIntentHint: "thread", matchedRule: "thread DOM/text markers" };
  }

  if (docsSelectors >= 4 || /\b(quickstart|installation|api reference|parameters|request body|response body)\b/.test(lowerText)) {
    return { pageIntentHint: "docs", matchedRule: "docs DOM/text markers" };
  }

  return { pageIntentHint: "unknown" };
}

function mergeIntent(
  payloadIntent: PageIntentHint | undefined,
  sourceKind: SourceKind,
  urlIntent: { pageIntentHint: PageIntentHint; matchedRule?: string },
  domIntent: { pageIntentHint: PageIntentHint; matchedRule?: string },
): {
  pageIntentHint: PageIntentHint;
  matchedRule?: string;
} {
  if (payloadIntent && payloadIntent !== "unknown") {
    return { pageIntentHint: payloadIntent, matchedRule: "payload pageIntentHint" };
  }

  if (sourceKind === "pdf") {
    return { pageIntentHint: "docs", matchedRule: urlIntent.matchedRule ?? "pdf source" };
  }

  if (urlIntent.pageIntentHint !== "unknown") {
    return urlIntent;
  }

  return domIntent;
}

export function detectSourceHints(payload: PagePayload): SourceHints {
  const url = safeUrl(payload.url);
  const text = normalizeWhitespace(`${payload.title ?? ""} ${payload.textContent ?? ""} ${payload.html ?? ""}`);
  const hostFamily = payload.sourceHints?.hostFamily ?? detectHostFamily(url?.hostname ?? "");
  const pdf = detectPdf(url, payload, text);
  const urlIntent = detectUrlIntent(url, hostFamily);
  const domIntent = detectDomIntent(payload, text);
  const intent = mergeIntent(payload.sourceHints?.pageIntentHint, pdf.sourceKind, urlIntent, domIntent);

  return {
    sourceKind: payload.sourceHints?.sourceKind ?? pdf.sourceKind,
    hostFamily,
    pageIntentHint: intent.pageIntentHint,
    matchedRule: payload.sourceHints?.matchedRule ?? pdf.matchedRule ?? intent.matchedRule,
    selectedTextLength: payload.selectedText?.trim().length ?? payload.sourceHints?.selectedTextLength ?? 0,
  };
}
