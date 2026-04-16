import {
  buildAudioDocument,
  ensureSentence,
  getNarratableBlocks,
  getNarratableSentences,
  normalizeAudioText,
  normalizeComparable,
  splitSentences,
  tokenize,
  type AudioDocument,
} from "@/lib/audioDocument";
import type { CleanedPage, PodcastScript, PodcastTurn, SummaryResult, ThreadModel } from "@/lib/types";

interface ConversationPlan {
  intro: string;
  mainPoint: string;
  supportingDetails: string[];
  tensionOrDebate?: string;
  whyItMatters: string;
  responseOrNextStep?: string;
  closing: string;
  recommendedTurnCount: number;
}

const BANNED_SPOKEN_PHRASES = [
  "audiolayer",
  "navigation chrome",
  "page furniture",
  "human version",
  "useful version",
  "what should we not overdo",
  "talk me through it like",
  "intentionally leave out",
  "watch:",
  "media caption",
  "image caption",
  "video caption",
];

const ENTITY_STOPWORDS = new Set([
  "A",
  "An",
  "And",
  "As",
  "At",
  "But",
  "By",
  "For",
  "From",
  "In",
  "It",
  "On",
  "Or",
  "The",
  "This",
  "To",
  "Why",
]);

const ARTICLE_HOST_B = [
  "What's the important part?",
  "What detail changes how you hear it?",
  "Why does that matter beyond the headline?",
  "Is there a response or next step?",
  "What's the useful thing to remember?",
  "Any extra context worth keeping?",
  "Where does that leave the story?",
];

const DOCS_HOST_B = [
  "Where would someone start?",
  "What are the main steps?",
  "What usually trips people up?",
  "What still needs the screen?",
  "So how should someone use this page?",
];

const THREAD_HOST_B = [
  "What are people reacting to?",
  "What did the replies focus on?",
  "Was there agreement, or more of a split?",
  "What practical detail came out of it?",
  "What's the useful takeaway?",
];

function normalizeForDialogue(text: string): string {
  return normalizeAudioText(text)
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimTurn(text: string, maxLength = 460): string {
  const normalized = normalizeForDialogue(text);

  if (normalized.length <= maxLength) {
    return ensureSentence(normalized);
  }

  const sentences = splitSentences(normalized);
  const selected: string[] = [];
  let length = 0;

  for (const sentence of sentences) {
    if (length + sentence.length > maxLength) {
      break;
    }

    selected.push(sentence);
    length += sentence.length + 1;
  }

  if (selected.length > 0) {
    return ensureSentence(selected.join(" "));
  }

  const shortened = normalized.slice(0, maxLength);
  const lastBreak = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("? "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf(", "),
    shortened.lastIndexOf(" "),
  );

  return ensureSentence(
    shortened
      .slice(0, lastBreak > 0 ? lastBreak : maxLength)
      .replace(/\b(and|or|but|because|with|the|a|an|to|of)$/i, "")
      .trim(),
  );
}

function cleanTitle(title: string): string {
  return normalizeForDialogue(title)
    .replace(/\s*-\s*(BBC News|The Guardian|CNN|Reuters|AP News|Associated Press).*$/i, "")
    .replace(/\s*\|\s*.*$/i, "")
    .replace(/\s*,\s*(?:says|said|finds|reports|analysis|explainer).+$/i, "")
    .replace(/\s*:\s*/g, ": ")
    .trim();
}

function lowerFirst(text: string): string {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function readableSubjectFromTitle(title: string): string {
  const cleaned = cleanTitle(title);
  if (!cleaned) {
    return "this page";
  }

  const colonPrefix = cleaned.split(":")[0]?.trim();
  if (colonPrefix && colonPrefix !== cleaned && colonPrefix.split(/\s+/).length <= 5) {
    return /\binjury$/i.test(colonPrefix) ? colonPrefix.replace(/\s+injury$/i, "'s injury") : colonPrefix;
  }

  const toMatch = cleaned.match(/^([A-Z][A-Za-z0-9& .'-]{2,80})\s+to\s+(.+)$/);
  if (toMatch?.[1] && toMatch[2]) {
    return `${toMatch[1]} planning to ${toMatch[2]}`;
  }

  return cleaned.split(/\s+/).length <= 14 ? lowerFirst(cleaned) : "this story";
}

function isLowValueSentence(sentence: string, page: CleanedPage): boolean {
  const comparable = normalizeComparable(sentence);

  return !comparable ||
    comparable === normalizeComparable(page.title) ||
    /^(published|updated|last updated)\s*\d/.test(comparable) ||
    /^\d{1,2}:\d{2}$/.test(comparable) ||
    /^(watch|listen|media caption|image caption|video caption)\b/i.test(sentence) ||
    /^by\s+[a-z]+/.test(comparable);
}

function cleanCandidateSentence(sentence: string, page: CleanedPage): string | null {
  const cleaned = normalizeForDialogue(sentence)
    .replace(/^Bullet:\s*/i, "")
    .replace(/^Original post\.\s*/i, "")
    .replace(/^Top replies\.\s*/i, "")
    .replace(/^Common themes\.\s*/i, "")
    .replace(/^Theme:\s*/i, "")
    .replace(/^Reply\s+\d+\.\s*/i, "")
    .replace(/\s+in a statement published by [^.]+/gi, "")
    .replace(/,\s*(?:confirmed|said|says|told|added)\s+[^.]{2,120}$/i, ".")
    .replace(/\bhas confirmed\b/gi, "says")
    .trim();

  if (!cleaned || isLowValueSentence(cleaned, page)) {
    return null;
  }

  if (page.pageType === "docs" && /^(code example omitted|a data table was omitted)/i.test(cleaned)) {
    return null;
  }

  return ensureSentence(cleaned);
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

function isDuplicateIdea(candidate: string, used: string[]): boolean {
  const comparable = normalizeComparable(candidate);
  return used.some((item) => {
    const itemComparable = normalizeComparable(item);
    return comparable === itemComparable ||
      (comparable.length > 80 && itemComparable.includes(comparable)) ||
      (itemComparable.length > 80 && comparable.includes(itemComparable)) ||
      tokenSimilarity(candidate, item) > 0.52;
  });
}

function selectDistinct(candidates: string[], maxItems: number, used: string[] = []): string[] {
  const selected: string[] = [];

  for (const candidate of candidates.map(normalizeForDialogue).filter(Boolean)) {
    if (isDuplicateIdea(candidate, [...used, ...selected])) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= maxItems) {
      break;
    }
  }

  return selected;
}

function getCandidateSentences(page: CleanedPage, summary: SummaryResult): string[] {
  const document = buildAudioDocument(page);

  return selectDistinct(
    [
      ...summary.selectedSentences,
      ...summary.takeaways,
      summary.shortSummary,
      ...getNarratableSentences(document),
    ]
      .flatMap((sentence) => splitSentences(sentence))
      .map((sentence) => cleanCandidateSentence(sentence, page))
      .filter((sentence): sentence is string => Boolean(sentence)),
    18,
  );
}

function extractEntities(text: string): string[] {
  const matches =
    normalizeForDialogue(text).match(
      /\b(?:[A-Z][A-Za-z0-9-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9-]*|[A-Z]{2,}|of|and|&))*\b/g,
    ) ?? [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const match of matches) {
    const firstWord = match.split(/\s+/)[0];
    const comparable = normalizeComparable(match);

    if (match.length < 3 || ENTITY_STOPWORDS.has(firstWord) || seen.has(comparable)) {
      continue;
    }

    seen.add(comparable);
    output.push(match);
  }

  return output;
}

function extractSubject(page: CleanedPage, sentences: string[]): string {
  if (page.pageType === "thread") {
    return cleanTitle(page.threadModel?.title ?? page.title);
  }

  if (page.pageType === "docs") {
    return cleanTitle(page.title);
  }

  const titleSubject = readableSubjectFromTitle(page.title);
  if (titleSubject && titleSubject !== "this story") {
    return titleSubject;
  }

  return extractEntities([page.title, ...sentences.slice(0, 3)].join(" "))[0] ?? "this story";
}

function chooseLead(sentences: string[], page: CleanedPage): string {
  const titleTokens = new Set(tokenize(page.title));

  return (
    sentences
      .map((sentence, index) => {
        const tokens = tokenize(sentence);
        const actionScore = /\b(says|said|announced|found|reveals?|shows?|will|has|have|is|are|plans?|expects?)\b/i.test(
          sentence,
        )
          ? 2
          : 0;
        const titleOverlap = tokens.filter((token) => titleTokens.has(token)).length / Math.max(1, titleTokens.size);

        return {
          sentence,
          score: titleOverlap * 1.4 + actionScore + Math.max(0, 4 - index * 0.35),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.sentence ?? page.title
  );
}

function findFact(sentences: string[], pattern: RegExp, used: string[] = []): string | undefined {
  return sentences.find((sentence) => pattern.test(sentence) && !isDuplicateIdea(sentence, used));
}

function recommendedTurnCount(document: AudioDocument, factCount: number): number {
  if (document.stats.wordCount >= 1_000 || factCount >= 4) {
    return 15;
  }

  if (document.stats.wordCount >= 550 || factCount >= 2) {
    return 11;
  }

  return 7;
}

function buildArticlePlan(page: CleanedPage, summary: SummaryResult, document: AudioDocument): ConversationPlan {
  const sentences = getCandidateSentences(page, summary);
  const subject = extractSubject(page, sentences);
  const mainPoint = chooseLead(sentences, page);
  const used = [mainPoint];
  const supportCandidates = [
    findFact(sentences, /\b(after|because|including|evidence|reported|according|data|figures?|percent|million|billion|charged|cost|fees?|method|approach)\b/i, used),
    findFact(sentences, /\b(response|responded|denied|warned|criticised|officials?|company|government|spokesperson|regulator|court|police|lawyer|minister|office)\b/i, used),
    findFact(sentences, /\b(next|expected|could|may|might|remain|unclear|review|investigation|change|plans?|future|timeline|confirm|scans?)\b/i, used),
    ...sentences,
  ].filter((sentence): sentence is string => Boolean(sentence));
  const supportingDetails = selectDistinct(supportCandidates, document.stats.isLongForm ? 4 : 2, used);
  used.push(...supportingDetails);
  const whyItMatters =
    findFact(sentences, /\b(means|could|may|might|risk|impact|change|affect|pressure|problem|concern|full force|consequence|blow|shows?|shifting|protect)\b/i, used) ??
    summary.whyThisMatters;
  used.push(whyItMatters);
  const responseOrNextStep = findFact(
    sentences,
    /\b(response|responded|denied|suspended|investigation|expected|could|may|next|review|confirm|unclear|not rule out|conditions|end of the year)\b/i,
    used,
  );

  return {
    intro: `This page is about ${subject}.`,
    mainPoint,
    supportingDetails,
    whyItMatters,
    responseOrNextStep,
    closing: responseOrNextStep ?? whyItMatters,
    recommendedTurnCount: recommendedTurnCount(document, supportingDetails.length + (responseOrNextStep ? 1 : 0)),
  };
}

function buildDocsPlan(page: CleanedPage, summary: SummaryResult, document: AudioDocument): ConversationPlan {
  const sentences = getCandidateSentences(page, summary);
  const subject = extractSubject(page, sentences);
  const start = findFact(sentences, /\b(start|setup|create|choose|install|configure|request|endpoint|before you start)\b/i) ??
    sentences[0] ??
    `${subject} explains a task step by step.`;
  const steps = selectDistinct(
    sentences.filter((sentence) =>
      /\b(step|send|request|response|create|choose|configure|limit|constraint|must|need)\b/i.test(sentence),
    ),
    3,
    [start],
  );
  const hasCode = getNarratableBlocks(document).some((block) => block.kind === "code");
  const caveat = hasCode
    ? "The code examples and exact syntax still need the screen, but the audio can help you understand the order of work."
    : "The screen is still useful for exact settings, names, and any visual examples.";

  return {
    intro: `This docs page is about ${subject}.`,
    mainPoint: start,
    supportingDetails: steps.length > 0 ? steps : sentences.slice(1, 3),
    tensionOrDebate: caveat,
    whyItMatters: "It helps you understand the path through the task before you return to the page for exact details.",
    closing: caveat,
    recommendedTurnCount: document.stats.wordCount >= 500 ? 11 : 7,
  };
}

function trimThreadPoint(text: string): string {
  const normalized = normalizeForDialogue(text);
  if (normalized.length <= 300) {
    return ensureSentence(normalized);
  }

  return trimTurn(normalized, 300);
}

function inferThreadTension(model: ThreadModel): string | undefined {
  const combined = model.replies.map((reply) => reply.text).join(" ");
  const positive = /\b(agree|yes|useful|would use|works|good|helpful|exactly)\b/i.test(combined);
  const caution = /\b(but|however|concern|risk|wrong|trust|not sure|depends|problem|edge case)\b/i.test(combined);

  if (positive && caution) {
    return "There is some agreement on the idea, but the replies add caveats about trust, workflow, or edge cases.";
  }

  if (caution) {
    return "The replies are more cautious than dismissive; they focus on where the idea could break down.";
  }

  if (positive) {
    return "The replies mostly build on the original idea and add practical uses for it.";
  }

  return undefined;
}

function buildThreadPlan(page: CleanedPage, summary: SummaryResult, document: AudioDocument): ConversationPlan {
  const model = page.threadModel;

  if (model) {
    const original = model.originalPost?.text ?? model.title;
    const themes = model.themes ?? [];
    const replyDetails = selectDistinct(
      [
        ...themes,
        ...model.replies.map((reply) => reply.text),
      ],
      model.replies.length >= 5 ? 4 : 3,
      [original],
    );
    const tension = inferThreadTension(model);

    return {
      intro: `This is a thread about ${cleanTitle(model.title)}.`,
      mainPoint: trimThreadPoint(original),
      supportingDetails: replyDetails,
      tensionOrDebate: tension,
      whyItMatters: themes.length
        ? `The replies mainly turn around ${themes.slice(0, 2).join(" and ")}.`
        : "The value is in the pattern of replies, not in reading every comment.",
      closing: "The useful takeaway is the shape of the discussion: the original need, the strongest replies, and the practical limits people raise.",
      recommendedTurnCount: model.replies.length >= 6 || document.stats.wordCount >= 800 ? 11 : 7,
    };
  }

  const sentences = getCandidateSentences(page, summary);
  const lead = sentences[0] ?? page.title;
  const details = selectDistinct(sentences.slice(1), 3, [lead]);

  return {
    intro: `This thread is about ${cleanTitle(page.title)}.`,
    mainPoint: lead,
    supportingDetails: details,
    whyItMatters: "The value is in where replies agree, push back, or add useful detail.",
    closing: "The useful takeaway is the shape of the replies rather than every individual comment.",
    recommendedTurnCount: document.stats.wordCount >= 800 ? 11 : 7,
  };
}

function buildConversationPlan(page: CleanedPage, summary: SummaryResult): ConversationPlan {
  const document = buildAudioDocument(page);

  if (page.pageType === "docs") {
    return buildDocsPlan(page, summary, document);
  }

  if (page.pageType === "thread") {
    return buildThreadPlan(page, summary, document);
  }

  return buildArticlePlan(page, summary, document);
}

function pushTurn(turns: PodcastTurn[], speaker: PodcastTurn["speaker"], text: string, usedHostB: string[] = []): void {
  if (speaker === "Host B") {
    if (usedHostB.some((question) => tokenSimilarity(question, text) > 0.5)) {
      return;
    }
    usedHostB.push(text);
  }

  turns.push({
    speaker,
    text: trimTurn(text),
  });
}

function renderArticleConversation(plan: ConversationPlan): PodcastTurn[] {
  const turns: PodcastTurn[] = [];
  const usedQuestions: string[] = [];
  const [detailOne, detailTwo, detailThree, detailFour] = plan.supportingDetails;

  pushTurn(turns, "Host A", plan.intro, usedQuestions);
  pushTurn(turns, "Host B", ARTICLE_HOST_B[0], usedQuestions);
  pushTurn(turns, "Host A", plan.mainPoint, usedQuestions);
  pushTurn(turns, "Host B", ARTICLE_HOST_B[1], usedQuestions);
  pushTurn(turns, "Host A", detailOne ?? plan.whyItMatters, usedQuestions);
  pushTurn(turns, "Host B", ARTICLE_HOST_B[2], usedQuestions);
  pushTurn(turns, "Host A", plan.whyItMatters, usedQuestions);

  if (plan.recommendedTurnCount >= 11 && detailTwo) {
    pushTurn(turns, "Host B", ARTICLE_HOST_B[5], usedQuestions);
    pushTurn(turns, "Host A", detailTwo, usedQuestions);
  }

  if (plan.recommendedTurnCount >= 13 && (plan.responseOrNextStep || detailThree)) {
    pushTurn(turns, "Host B", ARTICLE_HOST_B[3], usedQuestions);
    pushTurn(turns, "Host A", plan.responseOrNextStep ?? detailThree, usedQuestions);
  }

  if (plan.recommendedTurnCount >= 15 && detailFour) {
    pushTurn(turns, "Host B", ARTICLE_HOST_B[6], usedQuestions);
    pushTurn(turns, "Host A", detailFour, usedQuestions);
  }

  if (plan.recommendedTurnCount >= 11) {
    pushTurn(turns, "Host B", ARTICLE_HOST_B[4], usedQuestions);
    pushTurn(turns, "Host A", plan.closing, usedQuestions);
  }

  return turns.slice(0, plan.recommendedTurnCount);
}

function renderDocsConversation(plan: ConversationPlan): PodcastTurn[] {
  const turns: PodcastTurn[] = [];
  const usedQuestions: string[] = [];

  pushTurn(turns, "Host A", plan.intro, usedQuestions);
  pushTurn(turns, "Host B", DOCS_HOST_B[0], usedQuestions);
  pushTurn(turns, "Host A", plan.mainPoint, usedQuestions);
  pushTurn(turns, "Host B", DOCS_HOST_B[1], usedQuestions);
  pushTurn(turns, "Host A", plan.supportingDetails.join(" "), usedQuestions);
  pushTurn(turns, "Host B", DOCS_HOST_B[2], usedQuestions);
  pushTurn(turns, "Host A", plan.tensionOrDebate ?? plan.whyItMatters, usedQuestions);

  if (plan.recommendedTurnCount >= 11) {
    pushTurn(turns, "Host B", DOCS_HOST_B[3], usedQuestions);
    pushTurn(turns, "Host A", plan.closing, usedQuestions);
  }

  if (plan.recommendedTurnCount >= 9) {
    pushTurn(turns, "Host B", DOCS_HOST_B[4], usedQuestions);
    pushTurn(turns, "Host A", plan.whyItMatters, usedQuestions);
  }

  return turns.slice(0, plan.recommendedTurnCount);
}

function renderThreadConversation(plan: ConversationPlan): PodcastTurn[] {
  const turns: PodcastTurn[] = [];
  const usedQuestions: string[] = [];
  const [themeOne, themeTwo, themeThree] = plan.supportingDetails;

  pushTurn(turns, "Host A", plan.intro, usedQuestions);
  pushTurn(turns, "Host B", THREAD_HOST_B[0], usedQuestions);
  pushTurn(turns, "Host A", plan.mainPoint, usedQuestions);
  pushTurn(turns, "Host B", THREAD_HOST_B[1], usedQuestions);
  pushTurn(turns, "Host A", themeOne ?? plan.whyItMatters, usedQuestions);
  pushTurn(turns, "Host B", THREAD_HOST_B[2], usedQuestions);
  pushTurn(turns, "Host A", plan.tensionOrDebate ?? themeTwo ?? plan.whyItMatters, usedQuestions);

  if (plan.recommendedTurnCount >= 11 && themeTwo) {
    pushTurn(turns, "Host B", THREAD_HOST_B[3], usedQuestions);
    pushTurn(turns, "Host A", themeTwo, usedQuestions);
  }

  if (plan.recommendedTurnCount >= 13 && themeThree) {
    pushTurn(turns, "Host B", "Any nuance that changes the read on it?", usedQuestions);
    pushTurn(turns, "Host A", themeThree, usedQuestions);
  }

  if (plan.recommendedTurnCount >= 9) {
    pushTurn(turns, "Host B", THREAD_HOST_B[4], usedQuestions);
    pushTurn(turns, "Host A", plan.closing, usedQuestions);
  }

  return turns.slice(0, plan.recommendedTurnCount);
}

function renderConversation(page: CleanedPage, plan: ConversationPlan): PodcastTurn[] {
  if (page.pageType === "docs") {
    return renderDocsConversation(plan);
  }

  if (page.pageType === "thread") {
    return renderThreadConversation(plan);
  }

  return renderArticleConversation(plan);
}

function styleGuard(turns: PodcastTurn[], plan: ConversationPlan): PodcastTurn[] {
  const usedHostA: string[] = [];
  const usedHostB: string[] = [];

  return turns.map((turn, index) => {
    const text = trimTurn(turn.text);
    const lower = text.toLowerCase();
    const hasBannedPhrase = BANNED_SPOKEN_PHRASES.some((phrase) => lower.includes(phrase));
    const repeated =
      turn.speaker === "Host A"
        ? isDuplicateIdea(text, usedHostA)
        : isDuplicateIdea(text, usedHostB);

    if (!hasBannedPhrase && !repeated) {
      if (turn.speaker === "Host A") {
        usedHostA.push(text);
      } else {
        usedHostB.push(text);
      }

      return {
        ...turn,
        text,
      };
    }

    const fallback =
      turn.speaker === "Host B"
        ? index % 3 === 0
          ? "What changes from here?"
          : "What should someone remember?"
        : index > 5
          ? plan.closing
          : plan.mainPoint;

    return {
      ...turn,
      text: trimTurn(fallback),
    };
  });
}

export function createPodcastScript(
  page: CleanedPage,
  summary: SummaryResult,
): PodcastScript {
  const plan = buildConversationPlan(page, summary);
  const turns = styleGuard(renderConversation(page, plan), plan);
  const script = turns
    .map((turn) =>
      turn.cue
        ? `${turn.speaker}: ${turn.cue} ${turn.text}`
        : `${turn.speaker}: ${turn.text}`,
    )
    .join("\n");

  return {
    title: page.title,
    turns,
    script,
  };
}
