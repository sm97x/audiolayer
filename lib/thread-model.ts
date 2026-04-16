import {
  normalizeAudioText,
  normalizeComparable,
  splitSentences,
  tokenize,
} from "@/lib/audioDocument";
import type { ThreadModel, ThreadPost } from "@/lib/types";

const THEME_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "people want the main point without losing important context",
    pattern: /\b(summary|brief|main point|context|takeaway|signal|thesis|evidence)\b/i,
  },
  {
    label: "people want structure preserved so the page is easier to follow",
    pattern: /\b(section|heading|hierarchy|steps?|order|structure|flow)\b/i,
  },
  {
    label: "people do not want code or visual details read out line by line",
    pattern: /\b(code|screen|visual|image|table|syntax|screenshot|line by line)\b/i,
  },
  {
    label: "people are weighing whether the idea would be useful in practice",
    pattern: /\b(use|useful|would|need|want|practical|commute|workflow|habit)\b/i,
  },
  {
    label: "the replies add caution about trust, accuracy, or edge cases",
    pattern: /\b(trust|accurate|wrong|risk|caveat|edge case|concern|problem)\b/i,
  },
  {
    label: "the replies add implementation detail or a concrete suggestion",
    pattern: /\b(should|could|add|build|support|feature|option|setting|implementation)\b/i,
  },
];

export function cleanThreadPostText(text: string): string {
  return normalizeAudioText(text)
    .replace(/\s*@[\w.-]+\s+(?:posted\s+)?\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\s+/gi, " ")
    .replace(/^@\w[\w.-]{1,24}\s+/, "")
    .replace(/\b(?:upvote|downvote|share|save|hide|report|reply|award)\b\s*/gi, "")
    .replace(/\b\d+\s+(?:points?|comments?|replies|likes?|retweets?|upvotes?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

export function dedupeThreadPosts(posts: ThreadPost[]): ThreadPost[] {
  const output: ThreadPost[] = [];

  for (const post of posts) {
    const text = cleanThreadPostText(post.text);
    const comparable = normalizeComparable(text);
    if (!text || text.length < 20 || !comparable) {
      continue;
    }

    const duplicate = output.some((existing) => {
      const existingComparable = normalizeComparable(existing.text);
      return existingComparable === comparable ||
        existingComparable.includes(comparable) ||
        comparable.includes(existingComparable) ||
        tokenSimilarity(existing.text, text) > 0.82;
    });

    if (!duplicate) {
      output.push({
        ...post,
        text,
      });
    }
  }

  return output;
}

export function inferThreadThemes(model: ThreadModel, maxThemes = 3): string[] {
  const scored = THEME_RULES.map((rule) => {
    const count = model.replies.filter((reply) => rule.pattern.test(reply.text)).length;
    return {
      label: rule.label,
      count,
    };
  })
    .filter((theme) => theme.count > 0)
    .sort((left, right) => right.count - left.count);

  const themes = scored.map((theme) => theme.label);

  if (themes.length === 0 && model.replies.length > 0) {
    const bestReply = model.replies
      .flatMap((reply) => splitSentences(reply.text))
      .sort((left, right) => right.length - left.length)[0];

    if (bestReply) {
      themes.push(bestReply);
    }
  }

  return themes.slice(0, maxThemes);
}

export function withInferredThreadThemes(model: ThreadModel): ThreadModel {
  return {
    ...model,
    replies: dedupeThreadPosts(model.replies),
    originalPost: model.originalPost
      ? {
          ...model.originalPost,
          text: cleanThreadPostText(model.originalPost.text),
        }
      : undefined,
    themes: model.themes && model.themes.length > 0 ? model.themes : inferThreadThemes(model),
  };
}

export function threadModelToTextBlocks(model: ThreadModel): string[] {
  const blocks = [model.title];

  if (model.originalPost?.text) {
    blocks.push("Original post.");
    blocks.push(model.originalPost.text);
  }

  if (model.replies.length > 0) {
    blocks.push("Top replies.");
    model.replies.slice(0, 8).forEach((reply, index) => {
      const label = reply.author ? `Reply ${index + 1} from ${reply.author}.` : `Reply ${index + 1}.`;
      blocks.push(`${label} ${reply.text}`);
    });
  }

  if (model.themes && model.themes.length > 0) {
    blocks.push("Common themes.");
    model.themes.forEach((theme) => {
      blocks.push(`Theme: ${theme}`);
    });
  }

  return blocks;
}
