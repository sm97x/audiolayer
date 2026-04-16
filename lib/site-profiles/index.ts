import {
  normalizeWhitespace,
  pickFirstText,
  pickTitle,
} from "@/lib/extract/common";
import { cleanThreadPostText, dedupeThreadPosts, withInferredThreadThemes } from "@/lib/thread-model";
import type { HostFamily, SourceHints, ThreadModel, ThreadPost } from "@/lib/types";

export interface SiteProfile {
  hostFamily: HostFamily;
  preferredThreadSelectors: string[];
  junkSelectors: string[];
  detect(document: Document, text: string, hints: SourceHints): boolean;
  extractThread(document: Document, payloadTitle: string | undefined, sourceUrl: string): ThreadModel | null;
}

function firstMatchingText(root: ParentNode, selectors: string[], minLength = 8): string | undefined {
  for (const selector of selectors) {
    const value = pickFirstText(root, [selector], minLength);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function textFromElement(element: Element): string {
  return cleanThreadPostText(normalizeWhitespace(element.textContent ?? ""));
}

function authorFromElement(element: Element): string | undefined {
  return firstMatchingText(element, [
    "[data-testid='User-Name'] a",
    "[data-testid='tweetText'] + div a",
    "[data-author]",
    "[rel='author']",
    ".author",
    ".username",
    ".usertext",
    ".hnuser",
    ".comment-user",
    ".js-author",
    "[class*='author' i]",
    "[class*='user' i]",
  ], 2)
    ?.replace(/^u\//i, "")
    .replace(/^@/, "");
}

function scoreFromElement(element: Element): string | undefined {
  return firstMatchingText(element, [
    "[id*='score']",
    ".score",
    ".js-vote-count",
    "[class*='score' i]",
    "[aria-label*='score' i]",
  ], 1);
}

function timestampFromElement(element: Element): string | undefined {
  return normalizeWhitespace(
    element.querySelector("time")?.textContent ??
      element.querySelector("relative-time")?.textContent ??
      element.querySelector("[class*='age' i]")?.textContent ??
      "",
  ) || undefined;
}

function postFromElement(element: Element, depth = 0): ThreadPost | undefined {
  const text = textFromElement(element);
  if (text.length < 20) {
    return undefined;
  }

  return {
    author: authorFromElement(element),
    timestamp: timestampFromElement(element),
    score: scoreFromElement(element),
    depth,
    text,
  };
}

function collectPosts(document: Document, selectors: string[], maxPosts = 10): ThreadPost[] {
  const posts: ThreadPost[] = [];
  const seen = new Set<Element>();

  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (seen.has(element) || Array.from(seen).some((existing) => existing.contains(element))) {
        continue;
      }

      const depth = Number(element.getAttribute("data-depth") ?? element.getAttribute("data-level") ?? 0) || 0;
      const post = postFromElement(element, depth);
      if (!post) {
        continue;
      }

      seen.add(element);
      posts.push(post);
      if (posts.length >= maxPosts) {
        return dedupeThreadPosts(posts);
      }
    }
  }

  return dedupeThreadPosts(posts);
}

function modelFromParts(params: {
  title: string;
  originalPost?: ThreadPost;
  replies: ThreadPost[];
}): ThreadModel | null {
  const model = withInferredThreadThemes({
    title: params.title,
    originalPost: params.originalPost,
    replies: params.replies,
  });

  if (!model.originalPost && model.replies.length === 0) {
    return null;
  }

  return model;
}

const redditProfile: SiteProfile = {
  hostFamily: "reddit",
  preferredThreadSelectors: [
    "shreddit-comment",
    "[data-testid*='comment' i]",
    ".Comment",
    ".comment",
    ".thing.comment",
  ],
  junkSelectors: [
    "shreddit-ad-post",
    "[data-testid*='ad' i]",
    "[slot='credit-bar']",
    "[class*='promoted' i]",
  ],
  detect: (_document, text, hints) =>
    hints.hostFamily === "reddit" ||
    /(?:^|\s)r\/[A-Za-z0-9_]+/.test(text) ||
    /\b(sort by:|view discussions in|more replies|continue this thread)\b/i.test(text),
  extractThread(document, payloadTitle) {
    const title = firstMatchingText(document, [
      "shreddit-post h1",
      "[data-testid='post-title']",
      "h1",
      "a.title",
    ], 5) ?? pickTitle(document, payloadTitle ?? "Reddit thread");
    const originalText = firstMatchingText(document, [
      "shreddit-post [slot='text-body']",
      "[data-testid='post-content']",
      ".usertext-body .md",
      ".expando .md",
    ], 20);
    const replies = collectPosts(document, this.preferredThreadSelectors, 8);

    return modelFromParts({
      title,
      originalPost: originalText ? { text: originalText, depth: 0 } : undefined,
      replies,
    });
  },
};

const hackerNewsProfile: SiteProfile = {
  hostFamily: "hackernews",
  preferredThreadSelectors: [".athing.comtr", "tr.comtr", ".comment"],
  junkSelectors: [".pagetop", ".subtext"],
  detect: (_document, text, hints) => hints.hostFamily === "hackernews" || /\bnews\.ycombinator\.com|parent \| next\b/i.test(text),
  extractThread(document, payloadTitle) {
    const title = firstMatchingText(document, [".titleline a", "title", "h1"], 5) ?? payloadTitle ?? "Hacker News thread";
    const replies = collectPosts(document, this.preferredThreadSelectors, 10);

    return modelFromParts({
      title,
      originalPost: { text: title, depth: 0 },
      replies,
    });
  },
};

const githubProfile: SiteProfile = {
  hostFamily: "github",
  preferredThreadSelectors: [
    ".js-comment-container",
    ".timeline-comment",
    "[data-testid*='comment' i]",
    ".comment-body",
  ],
  junkSelectors: [".js-reactions-container", ".gh-header-actions"],
  detect: (_document, text, hints) =>
    hints.hostFamily === "github" &&
    (hints.pageIntentHint === "thread" || /\b(commented|opened this issue|discussion)\b/i.test(text)),
  extractThread(document, payloadTitle) {
    const title = firstMatchingText(document, [".js-issue-title", "bdi.js-issue-title", "h1"], 5) ??
      pickTitle(document, payloadTitle ?? "GitHub discussion");
    const bodyText = firstMatchingText(document, [
      "[data-testid='issue-body']",
      ".js-issue-body .comment-body",
      ".discussion-topic .comment-body",
      ".markdown-body",
    ], 20);
    const replies = collectPosts(document, this.preferredThreadSelectors, 8).filter(
      (reply) => normalizeWhitespace(reply.text) !== normalizeWhitespace(bodyText ?? ""),
    );

    return modelFromParts({
      title,
      originalPost: bodyText ? { text: bodyText, depth: 0 } : undefined,
      replies,
    });
  },
};

const stackOverflowProfile: SiteProfile = {
  hostFamily: "stackoverflow",
  preferredThreadSelectors: [".answer", ".comment", ".s-prose"],
  junkSelectors: [".js-voting-container", ".post-menu", ".js-post-menu"],
  detect: (_document, text, hints) =>
    hints.hostFamily === "stackoverflow" ||
    /\b(asked|answered|score|accepted answer|stack overflow)\b/i.test(text),
  extractThread(document, payloadTitle) {
    const title = firstMatchingText(document, ["#question-header h1", "h1"], 5) ??
      pickTitle(document, payloadTitle ?? "Stack Overflow question");
    const question = firstMatchingText(document, ["#question .s-prose", "#question .post-text", "#question"], 20);
    const replies = collectPosts(document, [".answer .s-prose", ".answer", ".comment-copy"], 8);

    return modelFromParts({
      title,
      originalPost: question ? { text: question, depth: 0 } : undefined,
      replies,
    });
  },
};

const xProfile: SiteProfile = {
  hostFamily: "x",
  preferredThreadSelectors: ["article[data-testid='tweet']", "article[role='article']", "[data-testid='tweetText']"],
  junkSelectors: ["[data-testid='sidebarColumn']", "[aria-label='Timeline: Trending now']"],
  detect: (_document, text, hints) =>
    hints.hostFamily === "x" ||
    /\b(repost|quote post|likes|replies|post your reply)\b/i.test(text),
  extractThread(document, payloadTitle) {
    const posts = collectPosts(document, this.preferredThreadSelectors, 8);
    const title = payloadTitle ?? posts[0]?.text.slice(0, 90) ?? pickTitle(document, "X thread");
    const [originalPost, ...replies] = posts;

    return modelFromParts({
      title,
      originalPost,
      replies,
    });
  },
};

const genericProfile: SiteProfile = {
  hostFamily: "generic",
  preferredThreadSelectors: [
    "article",
    "[class*='comment' i]",
    "[class*='reply' i]",
    "[data-testid*='comment' i]",
    "[data-testid*='reply' i]",
    "li",
  ],
  junkSelectors: [],
  detect: (_document, text, hints) =>
    hints.pageIntentHint === "thread" ||
    /\b(reply|replies|comments?|discussion|posted|answered)\b/i.test(text),
  extractThread(document, payloadTitle) {
    const title = pickTitle(document, payloadTitle ?? "Discussion thread");
    const body = firstMatchingText(document, [
      ".thread-header p:last-child",
      ".thread-header p",
      ".post-body",
      ".thread-body",
      "main > section:first-of-type p:last-child",
      "h1 + p",
      "main p",
    ], 30);
    const replies = collectPosts(document, this.preferredThreadSelectors, 8).filter(
      (reply) => normalizeComparableish(reply.text) !== normalizeComparableish(body ?? ""),
    );

    return modelFromParts({
      title,
      originalPost: body ? { text: body, depth: 0 } : undefined,
      replies,
    });
  },
};

function normalizeComparableish(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const PROFILES: SiteProfile[] = [
  redditProfile,
  hackerNewsProfile,
  githubProfile,
  stackOverflowProfile,
  xProfile,
  genericProfile,
];

export function getSiteProfile(hints: SourceHints): SiteProfile {
  return PROFILES.find((profile) => profile.hostFamily === hints.hostFamily) ?? genericProfile;
}

export function removeProfileJunk(document: Document, profile: SiteProfile): number {
  let removed = 0;

  profile.junkSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.remove();
      removed += 1;
    });
  });

  return removed;
}

export function extractThreadModelWithProfiles(
  document: Document,
  payloadTitle: string | undefined,
  sourceUrl: string,
  hints: SourceHints,
): ThreadModel | null {
  const text = normalizeWhitespace(document.body?.textContent ?? "");
  const preferred = getSiteProfile(hints);
  const candidates = [preferred, ...PROFILES.filter((profile) => profile !== preferred)];

  for (const profile of candidates) {
    if (!profile.detect(document, text, hints)) {
      continue;
    }

    removeProfileJunk(document, profile);
    const model = profile.extractThread(document, payloadTitle, sourceUrl);
    if (model && (model.originalPost || model.replies.length > 0)) {
      return model;
    }
  }

  return null;
}

export function threadProfileNotes(hints: SourceHints, model: ThreadModel | null): string[] {
  const notes = [`Used ${hints.hostFamily} thread profile.`];

  if (model) {
    notes.push(`Thread model kept ${model.replies.length} replies.`);
    if (model.themes?.length) {
      notes.push(`Inferred ${model.themes.length} reply themes.`);
    }
  }

  return notes;
}
