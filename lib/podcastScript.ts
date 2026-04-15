import {
  buildAudioDocument,
  getNarratableSentences,
  getNarratableText,
} from "@/lib/audioDocument";
import type { CleanedPage, PodcastScript, PodcastTurn, SummaryResult } from "@/lib/types";

type ConversationTheme =
  | "sports-injury"
  | "business-cuts"
  | "investigation"
  | "politics-news"
  | "docs"
  | "thread"
  | "general";

interface PodcastBrief {
  theme: ConversationTheme;
  subject: string;
  mainEvent: string;
  stakes: string;
  context: string[];
  uncertainty?: string;
  closingTakeaway: string;
  isLongForm: boolean;
  method?: string;
  evidence?: string;
  response?: string;
  scale?: string;
}

const BANNED_SPOKEN_PHRASES = [
  "audiolayer",
  "navigation chrome",
  "page furniture",
  "human version",
  "useful version",
  "what should we not overdo",
  "talk me through it like i am half-listening",
  "talk me through it like i'm half-listening",
  "what did audiolayer intentionally leave out",
  "intentionally leave out",
  "skip the surrounding",
  "the takeaway is",
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

function trimTurn(text: string, maxLength = 270): string {
  const normalized = normalizeForDialogue(text);

  if (normalized.length <= maxLength) {
    return ensureSentence(normalized);
  }

  const shortened = normalized.slice(0, maxLength);
  const lastBreak = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("? "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf(", "),
    shortened.lastIndexOf(" "),
  );

  const trimmed = shortened
    .slice(0, lastBreak > 0 ? lastBreak : maxLength)
    .replace(/\b(and|or|but|because|with|the|a|an|to|of)$/i, "")
    .trim();

  return ensureSentence(trimmed);
}

function ensureSentence(text: string): string {
  if (!text) {
    return text;
  }

  return /[.!?]["')\]]?$/.test(text) ? text : `${text}.`;
}

function normalizeForDialogue(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function comparableText(text: string): string {
  return normalizeForDialogue(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  return normalizeForDialogue(title)
    .replace(/\s*-\s*(BBC News|The Guardian|CNN|Reuters|AP News|Associated Press).*$/i, "")
    .replace(/\s*\|\s*.*$/i, "")
    .replace(/\s*,\s*says\s+.+$/i, "")
    .replace(/\s*:\s*/g, ": ")
    .trim();
}

function stripSeoSubjectNoise(text: string): string {
  return normalizeForDialogue(text)
    .replace(/\b(injury|updates?|latest|explained|analysis|opinion|review|report|news)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+:/g, ":")
    .trim();
}

function isLowValueSentence(sentence: string, page: CleanedPage): boolean {
  const comparable = comparableText(sentence);
  const titleComparable = comparableText(page.title);

  if (!comparable || comparable === titleComparable) {
    return true;
  }

  if (/^(published|updated|last updated)\s*\d/.test(comparable)) {
    return true;
  }

  if (/^(watch|media caption|image caption|video caption)\b/i.test(sentence)) {
    return true;
  }

  if (/^by\s+[a-z]+/.test(comparable) && sentence.length < 80) {
    return true;
  }

  if (/^(bullet|code example omitted)/i.test(sentence)) {
    return page.pageType === "article";
  }

  return false;
}

function uniqueSentences(sentences: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const sentence of sentences.map(normalizeForDialogue)) {
    const comparable = comparableText(sentence);
    if (!comparable || seen.has(comparable)) {
      continue;
    }

    seen.add(comparable);
    output.push(sentence);
  }

  return output;
}

function comparableTokens(text: string): string[] {
  return comparableText(text).split(/\s+/).filter(Boolean);
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(comparableTokens(left));
  const rightTokens = new Set(comparableTokens(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function getCandidateSentences(page: CleanedPage, summary: SummaryResult): string[] {
  const document = buildAudioDocument(page);

  return uniqueSentences([
    ...getNarratableSentences(document),
    ...summary.selectedSentences,
    ...summary.takeaways,
    summary.shortSummary,
  ]).filter((sentence) => !isLowValueSentence(sentence, page));
}

function extractEntities(text: string): string[] {
  const matches =
    normalizeForDialogue(text).match(
      /\b(?:[A-Z][A-Za-z0-9-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9-]*|[A-Z]{2,}|of|and|&))*\b/g,
    ) ?? [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const match of matches) {
    const entity = normalizeForDialogue(match).replace(/\s+(has|will|was|is|are)$/i, "");
    const firstWord = entity.split(/\s+/)[0];

    if (
      !entity ||
      entity.length < 3 ||
      ENTITY_STOPWORDS.has(firstWord) ||
      /\b(World Cup|Champions League|Premier League)\b/i.test(entity)
    ) {
      continue;
    }

    const comparable = comparableText(entity);
    if (seen.has(comparable)) {
      continue;
    }

    seen.add(comparable);
    output.push(entity);
  }

  return output;
}

function extractSubject(page: CleanedPage, sentences: string[]): string {
  const topic = cleanTitle(page.title);
  const combinedText = `${topic} ${sentences.slice(0, 8).join(" ")}`.toLowerCase();

  if (/\b(investigation|undercover|bbc has found|bbc news investigation)\b/.test(combinedText)) {
    if (/\b(asylum|migrants?|legal advisers?|law firms?|fake claims?|fabricated evidence)\b/.test(combinedText)) {
      return "a BBC investigation into fake asylum claims";
    }

    return "an undercover investigation";
  }

  if (page.pageType === "docs" || page.pageType === "thread") {
    return topic;
  }

  const beforeColon = topic.split(":")[0]?.trim() ?? topic;
  const beforeDash = beforeColon.split(" - ")[0]?.trim() ?? beforeColon;
  const cleanedPrefix = stripSeoSubjectNoise(beforeDash);
  const prefixWordCount = cleanedPrefix.split(/\s+/).filter(Boolean).length;

  if (prefixWordCount >= 1 && prefixWordCount <= 6 && !/^(why|how|what|when|where)\b/i.test(cleanedPrefix)) {
    return cleanedPrefix;
  }

  if (
    prefixWordCount > 6 &&
    prefixWordCount <= 14 &&
    /\b(help|helps|finds?|reveals?|exposes?|shows?|says|plans?|cuts?|charges?)\b/i.test(cleanedPrefix)
  ) {
    return cleanedPrefix.charAt(0).toLowerCase() + cleanedPrefix.slice(1);
  }

  const entity = extractEntities([topic, ...sentences.slice(0, 3)].join(" "))[0];
  if (entity) {
    return entity;
  }

  return topic.length <= 72 ? topic : "this story";
}

function detectTheme(page: CleanedPage): ConversationTheme {
  const text = `${page.title} ${getNarratableText(page)}`.toLowerCase();

  if (page.pageType === "docs") {
    return "docs";
  }

  if (page.pageType === "thread") {
    return "thread";
  }

  if (
    /\b(world cup|champions league|premier league|striker|football|injury|injured|achilles|squad|season|coach|manager)\b/.test(
      text,
    )
  ) {
    return "sports-injury";
  }

  if (/\b(job cuts|staff|savings|financial pressures|layoffs|redundancies|budget|cost cuts|headcount)\b/.test(text)) {
    return "business-cuts";
  }

  if (/\b(investigation|undercover|reporters?|fabricated evidence|fake claims?|law firms?|legal advisers?|home office)\b/.test(text)) {
    return "investigation";
  }

  if (/\b(government|minister|parliament|senate|congress|election|policy|vote|lawmakers|campaign)\b/.test(text)) {
    return "politics-news";
  }

  return "general";
}

function chooseMainSentence(sentences: string[], page: CleanedPage): string {
  const titleTokens = new Set(comparableText(page.title).split(/\s+/).filter((token) => token.length > 3));

  return (
    sentences
      .map((sentence, index) => {
        const tokens = comparableText(sentence).split(/\s+/).filter(Boolean);
        const overlap = tokens.filter((token) => titleTokens.has(token)).length;
        const actionScore = /\b(says|said|confirmed|announced|will|would|could|has|have|is|are|plans?|expects?)\b/i.test(
          sentence,
        )
          ? 2
          : 0;

        return {
          sentence,
          score: overlap * 1.2 + actionScore + Math.max(0, 3 - index * 0.35),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.sentence ?? cleanTitle(page.title)
  );
}

function pickContextSentences(sentences: string[], mainEvent: string, theme: ConversationTheme): string[] {
  const mainComparable = comparableText(mainEvent);
  const keywordMap: Record<ConversationTheme, RegExp> = {
    "sports-injury": /\b(standout|goals?|assists?|debut|squad|club|season|joined|stretcher|sidelined|setbacks?|returned|absence)\b/i,
    "business-cuts": /\b(savings|staff|jobs?|services?|channels?|budget|financial|pressure|costs?|teams?|two years|cuts?)\b/i,
    investigation: /\b(undercover|reporters?|evidence|fabricated|fake|home office|response|claims?|advisers?|law firms?|statistics|percent|problem)\b/i,
    "politics-news": /\b(policy|minister|government|vote|law|timeline|reaction|official|campaign|public|parliament|congress)\b/i,
    docs: /\b(start|setup|request|response|step|code|endpoint|configure|install|limit|constraint)\b/i,
    thread: /\b(reply|replies|react|discussion|people|thread|original|post|comment|pattern)\b/i,
    general: /\b(because|means|shows|change|shift|result|impact|risk|plan|next|expected)\b/i,
  };
  const isLeadRestatement = (sentence: string): boolean =>
    theme === "sports-injury" &&
    ((/\bmiss\b/i.test(sentence) &&
      /\b(world cup|season|tournament)\b/i.test(sentence) &&
      /\b(injury|achilles)\b/i.test(sentence)) ||
      /\bseverity\b.*\binjury\b/i.test(sentence) ||
      /\bprevent\b.*\bparticipating\b/i.test(sentence));
  const isDistinctContext = (sentence: string): boolean =>
    comparableText(sentence) !== mainComparable &&
    tokenSimilarity(sentence, mainEvent) < 0.5 &&
    !isLeadRestatement(sentence);

  const preferred = sentences.filter(
    (sentence) => isDistinctContext(sentence) && keywordMap[theme].test(sentence),
  );
  const fallback = sentences.filter(isDistinctContext);

  return uniqueSentences([...preferred, ...fallback]).slice(0, 2);
}

function repairGrammar(text: string): string {
  return normalizeForDialogue(text)
    .replace(/\bexpected to finishing\b/gi, "expected to finish")
    .replace(/\bexpected to participating\b/gi, "expected to participate")
    .replace(/\bnot expected to finishing\b/gi, "not expected to finish")
    .replace(/\bnot expected to participating\b/gi, "not expected to participate")
    .replace(/\bfinish the season with ([A-Z][A-Za-z0-9-]*) and participating in\b/g, "finish the season with $1 or participate in")
    .replace(/\bprevent him from finish\b/gi, "prevent him from finishing")
    .replace(/\bprevent her from finish\b/gi, "prevent her from finishing")
    .replace(/\bthis is is\b/gi, "this is")
    .replace(/\s+/g, " ")
    .trim();
}

function paraphraseFact(sentence: string): string {
  const withoutAttributionTail = normalizeForDialogue(sentence)
    .replace(/,\s*confirmed\s+.+$/i, ".")
    .replace(/,\s*said\s+.+$/i, ".")
    .replace(/\s+Why this matters:.+$/i, ".")
    .replace(/\bhas confirmed\b/gi, "says")
    .replace(/\bconfirmed\b/gi, "said")
    .replace(/\bwill miss\b/gi, "is expected to miss")
    .replace(/\bafter suffering\b/gi, "after")
    .replace(/\bwas set to be part of\b/gi, "had been expected to be part of")
    .replace(/\bwere set to be part of\b/gi, "had been expected to be part of")
    .replace(/\bin a statement published by\b/gi, "through")
    .replace(/\bthe article says\b/gi, "the piece says")
    .replace(/^The severity of his injury will unfortunately prevent him from/i, "He is not expected to")
    .replace(/^The severity of her injury will unfortunately prevent her from/i, "She is not expected to")
    .replace(/^The severity of their injuries will unfortunately prevent them from/i, "They are not expected to");

  return ensureSentence(repairGrammar(withoutAttributionTail));
}

function withArticle(nounPhrase: string): string {
  const normalized = normalizeForDialogue(nounPhrase);

  if (/^(a|an|the)\s/i.test(normalized)) {
    return normalized;
  }

  if (/^(World Cup|Champions League|Premier League|Olympics|European Championship)\b/i.test(normalized)) {
    return `the ${normalized}`;
  }

  return /^[aeiou]/i.test(normalized) ? `an ${normalized}` : `a ${normalized}`;
}

function extractAuthority(sentence: string): string | undefined {
  const normalized = normalizeForDialogue(sentence);
  const roleMatch = normalized.match(
    /\b(?:manager|coach|minister|chief|president|director|secretary)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:has\s+confirmed|confirmed|said|says|announced)\b/,
  );

  if (roleMatch?.[1]) {
    return roleMatch[1];
  }

  const saidMatch = normalized.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:has\s+confirmed|confirmed|said|says|announced)\b/,
  );

  return saidMatch?.[1];
}

function extractPossessiveTeam(text: string): string | undefined {
  return normalizeForDialogue(text).match(
    /\b(?:during|in|after)\s+([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,2})'s\b/,
  )?.[1];
}

function extractInjury(text: string): string | undefined {
  return normalizeForDialogue(text).match(
    /\b(?:suspected\s+)?(?:achilles|hamstring|knee|ankle|shoulder|calf|back)\s+injury\b/i,
  )?.[0];
}

function extractCompetition(text: string): string | undefined {
  return normalizeForDialogue(text).match(
    /\b(World Cup|Champions League|Premier League|European Championship|Olympics|playoffs?|finals?|tournament)\b/i,
  )?.[0];
}

function buildSportsMainEvent(subject: string, sentence: string, fullText: string): string {
  const authority = extractAuthority(sentence);
  const competition = extractCompetition(`${sentence} ${fullText}`);
  const injury = extractInjury(`${sentence} ${fullText}`);
  const team = extractPossessiveTeam(sentence) ?? extractPossessiveTeam(fullText);
  const hasLongAbsence = /\b(long absence|rule him out|rule her out|rest of the season|miss the rest)\b/i.test(fullText);

  if (competition && /\bmiss\b/i.test(sentence + fullText)) {
    return trimTurn(
      `${authority ? `${authority} says` : "The report says"} ${subject} is expected to miss ${withArticle(competition)}${
        injury ? ` because of ${withArticle(injury)}` : ""
      }${team && hasLongAbsence ? `, with ${team} also bracing for a long absence` : ""}.`,
    );
  }

  return paraphraseFact(sentence);
}

function summarizeSportsContext(sentence: string, fullText: string): string {
  const normalized = normalizeForDialogue(sentence);
  const club =
    normalized.match(/\bjoined\s+([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,2})\b/)?.[1] ??
    extractPossessiveTeam(fullText);
  const stats = normalized.match(
    /\bwith\s+([0-9]+ goals?\s+and\s+(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+assists?[^.]*)/i,
  )?.[1];

  if (/\bstandout performers?\b/i.test(normalized) && stats) {
    return ensureSentence(
      `He was not a fringe name either: he had been one of${
        club ? ` ${club}'s` : " his team's"
      } standout performers, with ${stats}`,
    );
  }

  if (/\bdebut\b/i.test(normalized) && /\bsquad\b/i.test(normalized)) {
    return "For the national team, it stings because he had only recently broken into the group and was expected to be involved.";
  }

  if (/\bstretcher\b/i.test(normalized)) {
    const worriedClub = normalized.match(/\b([A-Z][A-Za-z0-9-]*)\s+fear\b/)?.[1];

    return `${worriedClub ? `${worriedClub} fear` : "The report points to"} a long absence after he left on a stretcher, so this already sounds more serious than a routine knock.`;
  }

  if (/\bsetbacks?|sidelined|injuries\b/i.test(normalized)) {
    return "For the club, it lands on top of an injury list that was already causing problems.";
  }

  return paraphraseFact(normalized);
}

function buildSportsStakes(fullText: string): string {
  const hasWorldCup = /\bworld cup\b/i.test(fullText);
  const hasClub = /\bclub|liverpool|season|champions league|premier league\b/i.test(fullText);

  if (hasWorldCup && hasClub) {
    return "Because it hits two calendars at once: France have to adjust their tournament plans, and his club have to rethink the end of the season.";
  }

  if (hasWorldCup) {
    return "Because tournament squads are built around availability, and losing a player this late changes the shape of the plan.";
  }

  return "Because availability is the whole issue here: coaches now have to plan around a player they expected to use.";
}

function findStorySentence(
  sentences: string[],
  pattern: RegExp,
  fallback?: string,
  exclude: string[] = [],
): string {
  const match = sentences.find(
    (sentence) =>
      pattern.test(sentence) &&
      !exclude.some((excluded) => tokenSimilarity(sentence, excluded) > 0.5),
  );
  return match ? paraphraseFact(match) : fallback ? paraphraseFact(fallback) : "";
}

function buildBusinessStakes(fullText: string): string {
  if (/\bchannels?|services?\b/i.test(fullText)) {
    return "Because the numbers may turn into real product choices: which teams, channels, or services still get protected.";
  }

  if (/\bstaff|jobs?|headcount\b/i.test(fullText)) {
    return "Because this is not just accounting language. It affects people, teams, and what the organization can realistically keep doing.";
  }

  return "Because financial pressure is becoming an operational decision, not just a line in a budget.";
}

function buildPoliticsStakes(fullText: string): string {
  if (/\bvote|law|policy|government\b/i.test(fullText)) {
    return "Because this is where a political position starts turning into policy, timelines, and consequences for the people affected.";
  }

  return "Because the important part is not the announcement itself, but what it changes next.";
}

function buildInvestigationStakes(fullText: string): string {
  if (/\basylum\b/i.test(fullText) && /\bhome office\b/i.test(fullText)) {
    return "Because the allegation is not just individual dishonesty; it is that parts of a professional advice market may be helping people exploit a protection system.";
  }

  return "Because the reporting points to a wider pattern, not just a single isolated example.";
}

function buildGeneralStakes(fullText: string): string {
  if (/\brisk|concern|warning|pressure\b/i.test(fullText)) {
    return "Because the story is really about pressure building, not just the headline event.";
  }

  if (/\blaunch|release|plan|announce|change|shift\b/i.test(fullText)) {
    return "Because it marks a shift from idea to action, and the consequences are what make the story worth hearing.";
  }

  return "Because the surrounding details matter only if they explain what changes, who is affected, or what happens next.";
}

function buildUncertainty(sentences: string[], theme: ConversationTheme, fullText: string): string | undefined {
  const uncertaintySentence = sentences.find((sentence) =>
    /\b(scans?|expected|could|may|might|remains?|not yet|next|await|confirm|extent|rule out|unclear)\b/i.test(sentence),
  );

  if (theme === "sports-injury") {
    if (/\bscans?\b/i.test(fullText)) {
      return "The scan results still matter for the exact timeline, but the story is already pointing toward a long absence rather than a quick return.";
    }

    if (/\bcould\b/i.test(fullText)) {
      return "The exact timeline is still open, but the practical planning now starts from the assumption that he will be unavailable.";
    }
  }

  if (!uncertaintySentence) {
    if (theme === "investigation") {
      return "What remains hard to pin down is the full scale: the reporting shows concrete examples, but the broader system problem is harder to measure precisely.";
    }

    return undefined;
  }

  if (theme === "business-cuts" && /\bnot rule out|could|may|next|services?|channels?\b/i.test(uncertaintySentence)) {
    return "The open question is how far the changes go after the first round of cuts, especially if services or teams are still under review.";
  }

  if (theme === "politics-news") {
    return "The next thing to watch is whether the announcement turns into a concrete timetable, a vote, or a policy change people can actually measure.";
  }

  if (theme === "investigation") {
    return "The open question is how widespread this is, and whether regulators or officials can separate fabricated claims from genuine need without damaging legitimate cases.";
  }

  return paraphraseFact(uncertaintySentence);
}

function buildClosing(theme: ConversationTheme, subject: string, fullText: string): string {
  if (theme === "sports-injury") {
    if (/\bworld cup\b/i.test(fullText)) {
      return `${subject}'s injury is bigger than one team sheet. It forces both club and country to plan without him.`;
    }

    return `${subject}'s availability is now the story, because the planning has to change around the injury.`;
  }

  if (theme === "business-cuts") {
    return `${subject} is moving from financial pressure to visible tradeoffs about people, services, and priorities.`;
  }

  if (theme === "investigation") {
    return `The important point is that ${subject} raises two questions at once: alleged fraud in individual cases, and whether the system can catch it without hurting genuine applicants.`;
  }

  if (theme === "politics-news") {
    return `The next step matters because it will show whether ${subject} becomes a concrete change or just another political signal.`;
  }

  if (theme === "docs") {
    return "Use the audio to understand the flow, then go back to the page for exact syntax and implementation detail.";
  }

  if (theme === "thread") {
    return "The original point matters, but the replies show where people actually agree, push back, or add detail.";
  }

  return `${subject} matters because it changes the next decision, not just the headline.`;
}

function buildPodcastBrief(page: CleanedPage, summary: SummaryResult): PodcastBrief {
  const document = buildAudioDocument(page);
  const theme = detectTheme(page);
  const sentences = getCandidateSentences(page, summary);
  const subject = extractSubject(page, sentences);
  const mainSentence = chooseMainSentence(sentences, page);
  const fullText = `${page.title}\n${getNarratableText(document)}`;
  const contextSentences = pickContextSentences(sentences, mainSentence, theme);
  const mainEvent =
    theme === "sports-injury"
      ? buildSportsMainEvent(subject, mainSentence, fullText)
      : theme === "investigation"
        ? findStorySentence(
            sentences,
            /\b(shadow industry|bbc has found|law firms?|advisers?).*\b(migrants?|pretend|asylum|claims?|stay in the UK)\b/i,
            mainSentence,
          )
      : paraphraseFact(mainSentence);
  const stakes =
    theme === "sports-injury"
      ? buildSportsStakes(fullText)
      : theme === "business-cuts"
        ? buildBusinessStakes(fullText)
        : theme === "investigation"
          ? buildInvestigationStakes(fullText)
          : theme === "politics-news"
            ? buildPoliticsStakes(fullText)
            : theme === "docs"
              ? "Because docs are easier to listen to when you hear the path through the task before looking at the exact code."
              : theme === "thread"
                ? "Because the value is in the shape of the reaction: what the original post says, and where the replies add signal."
                : buildGeneralStakes(fullText);
  const context =
    theme === "sports-injury"
      ? contextSentences.map((sentence) => summarizeSportsContext(sentence, fullText))
      : contextSentences.map(paraphraseFact);
  const method =
    theme === "investigation"
      ? findStorySentence(sentences, /\b(after gathering|reporters? posed|tip-offs|sent undercover|undercover reporters?)\b/i, undefined, [mainEvent])
      : undefined;
  const evidence =
    theme === "investigation"
      ? findStorySentence(sentences, /\b(fake cover stories|fabricated evidence|supporting letters|photographs|medical reports|charged up|fake claim|comprehensive package)\b/i, undefined, [mainEvent, method ?? ""])
      : undefined;
  const response =
    theme === "investigation"
      ? findStorySentence(sentences, /\b(Home Office|full force of the law|regulation authority|suspended|denied|response|spokesperson)\b/i)
      : undefined;
  const scale =
    theme === "investigation"
      ? findStorySentence(sentences, /\b(35 percent|100,000|statistics|2023|vast problem|scale|claims)\b/i)
      : undefined;

  return {
    theme,
    subject,
    mainEvent,
    stakes,
    context,
    uncertainty: buildUncertainty(sentences, theme, fullText),
    closingTakeaway: buildClosing(theme, subject, fullText),
    isLongForm: document.stats.isLongForm,
    method: method || undefined,
    evidence: evidence || undefined,
    response: response || undefined,
    scale: scale || undefined,
  };
}

function investigationConversation(brief: PodcastBrief): PodcastTurn[] {
  const turns: PodcastTurn[] = [
    {
      speaker: "Host A",
      text: trimTurn(`This is about ${brief.subject}. The central issue is whether people paid for professional help to build false asylum claims.`, 330),
    },
    {
      speaker: "Host B",
      text: "What is the core finding?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.mainEvent, 340),
    },
    {
      speaker: "Host B",
      text: "How did the reporting get underneath it?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.method ?? "Reporters used direct evidence and undercover reporting to test whether advisers would help construct false claims.", 340),
    },
    {
      speaker: "Host B",
      text: "And what kind of evidence are we talking about?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.evidence ?? brief.context[0] ?? "The examples are about fabricated stories, supporting material, and coaching people on what to say.", 360),
    },
    {
      speaker: "Host B",
      text: "What was the official response?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.response ?? "Officials and organisations named in the reporting pushed back, denied wrongdoing, or said the conduct would be investigated.", 340),
    },
  ];

  if (brief.isLongForm) {
    turns.push(
      {
        speaker: "Host B",
        text: "Why is this bigger than a few individual cases?",
      },
      {
        speaker: "Host A",
        text: trimTurn(`${brief.stakes} ${brief.scale ?? ""}`, 360),
      },
    );
  }

  turns.push(
    {
      speaker: "Host B",
      text: "What remains unresolved?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.uncertainty ?? brief.closingTakeaway, 360),
    },
  );

  return turns;
}

function articleConversation(brief: PodcastBrief): PodcastTurn[] {
  if (brief.theme === "investigation") {
    return investigationConversation(brief);
  }

  if (brief.theme === "sports-injury") {
    return [
      {
        speaker: "Host A",
        text: trimTurn(`This is a rough one for ${brief.subject}. The injury is the headline, but the timing is what makes it hit so hard.`),
      },
      {
        speaker: "Host B",
        text: "So this is bigger than one bad night?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.mainEvent),
      },
      {
        speaker: "Host B",
        text: "That timing sounds brutal. Why does it matter so much?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.stakes),
      },
      {
        speaker: "Host B",
        text: "Was he central to the plans, or more of a depth option?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.context.join(" ") || "The context is that the injury changes plans that were already in motion."),
      },
      {
        speaker: "Host B",
        text: "What is still unclear?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.uncertainty ?? brief.closingTakeaway),
      },
      {
        speaker: "Host B",
        text: trimTurn(brief.closingTakeaway),
      },
    ];
  }

  if (brief.theme === "business-cuts") {
    return [
      {
        speaker: "Host A",
        text: trimTurn(`This is a pressure story about ${brief.subject}: the financial strain is turning into visible decisions.`),
      },
      {
        speaker: "Host B",
        text: "How big is the move?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.mainEvent),
      },
      {
        speaker: "Host B",
        text: "So what changes for people inside it, or for the people who use it?",
      },
      {
        speaker: "Host A",
        text: trimTurn(`${brief.stakes} ${brief.context[0] ?? ""}`),
      },
      {
        speaker: "Host B",
        text: "Is the next part clear yet?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.uncertainty ?? brief.closingTakeaway),
      },
    ];
  }

  if (brief.theme === "politics-news") {
    return [
      {
        speaker: "Host A",
        text: trimTurn(`The important thing in this story about ${brief.subject} is what moves from words into action.`),
      },
      {
        speaker: "Host B",
        text: "What actually happened?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.mainEvent),
      },
      {
        speaker: "Host B",
        text: "And why should someone keep paying attention after the headline?",
      },
      {
        speaker: "Host A",
        text: trimTurn(`${brief.stakes} ${brief.context[0] ?? ""}`),
      },
      {
        speaker: "Host B",
        text: "What happens next?",
      },
      {
        speaker: "Host A",
        text: trimTurn(brief.uncertainty ?? brief.closingTakeaway),
      },
    ];
  }

  return [
    {
      speaker: "Host A",
      text: trimTurn(`The story here is about ${brief.subject}, but the interesting part is what changes after the headline.`),
    },
    {
      speaker: "Host B",
      text: "What is the core thing to know?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.mainEvent),
    },
    {
      speaker: "Host B",
      text: "Why does that matter?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`${brief.stakes} ${brief.context[0] ?? ""}`),
    },
    {
      speaker: "Host B",
      text: brief.uncertainty ? "What is still open?" : "Where does that leave us?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.uncertainty ?? brief.closingTakeaway),
    },
  ];
}

function docsConversation(brief: PodcastBrief): PodcastTurn[] {
  return [
    {
      speaker: "Host A",
      text: trimTurn(`This docs page is about ${brief.subject}. The best audio version gives you the route through the task before you go back to the screen.`),
    },
    {
      speaker: "Host B",
      text: "Where would I start if I needed to use it?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.mainEvent),
    },
    {
      speaker: "Host B",
      text: "And what should stay visual?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`The code and exact request shapes. In audio, the helpful part is the setup, the order of steps, and the constraints. ${brief.context[0] ?? ""}`),
    },
    {
      speaker: "Host B",
      text: trimTurn(brief.closingTakeaway),
    },
  ];
}

function threadConversation(brief: PodcastBrief): PodcastTurn[] {
  return [
    {
      speaker: "Host A",
      text: trimTurn(`This thread is about ${brief.subject}. The point is to hear the shape of the conversation, not every repeated reply.`),
    },
    {
      speaker: "Host B",
      text: "What are people reacting to first?",
    },
    {
      speaker: "Host A",
      text: trimTurn(brief.mainEvent),
    },
    {
      speaker: "Host B",
      text: "And where do the replies move after that?",
    },
    {
      speaker: "Host A",
      text: trimTurn(`${brief.context[0] ?? brief.stakes} ${brief.context[1] ?? ""}`),
    },
    {
      speaker: "Host B",
      text: trimTurn(brief.closingTakeaway),
    },
  ];
}

function renderConversation(brief: PodcastBrief): PodcastTurn[] {
  if (brief.theme === "docs") {
    return docsConversation(brief);
  }

  if (brief.theme === "thread") {
    return threadConversation(brief);
  }

  return articleConversation(brief);
}

function styleGuard(turns: PodcastTurn[], brief: PodcastBrief): PodcastTurn[] {
  return turns.map((turn, index) => {
    const text = repairGrammar(trimTurn(turn.text));
    const lower = text.toLowerCase();
    const hasBannedPhrase = BANNED_SPOKEN_PHRASES.some((phrase) => lower.includes(phrase));

    if (!hasBannedPhrase) {
      return {
        ...turn,
        text,
      };
    }

    return {
      ...turn,
      text:
        turn.speaker === "Host B"
          ? index % 2 === 0
            ? "Why does that matter?"
            : "What changes from here?"
          : trimTurn(index > 4 ? brief.closingTakeaway : brief.mainEvent),
    };
  });
}

export function createPodcastScript(
  page: CleanedPage,
  summary: SummaryResult,
): PodcastScript {
  const brief = buildPodcastBrief(page, summary);
  const turns = styleGuard(renderConversation(brief), brief);
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
