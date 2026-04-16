export type PageType = "article" | "docs" | "thread";
export type ListenMode = "brief" | "read" | "podcast";
export type SourceKind = "html" | "pdf";
export type HostFamily =
  | "bbc"
  | "reddit"
  | "x"
  | "hackernews"
  | "github"
  | "stackoverflow"
  | "generic";
export type PageIntentHint = "article" | "docs" | "thread" | "unknown";

export interface SourceHints {
  sourceKind: SourceKind;
  hostFamily: HostFamily;
  pageIntentHint: PageIntentHint;
  matchedRule?: string;
  selectedTextLength?: number;
}

export interface PagePayload {
  url: string;
  html?: string;
  textContent?: string;
  title?: string;
  selectedText?: string;
  sourceHints?: Partial<SourceHints>;
}

export interface ThreadPost {
  author?: string;
  timestamp?: string;
  score?: string;
  depth?: number;
  text: string;
}

export interface ThreadModel {
  title: string;
  originalPost?: ThreadPost;
  replies: ThreadPost[];
  themes?: string[];
}

export interface ClassifierMetrics {
  h1Count: number;
  headingCount: number;
  paragraphCount: number;
  longParagraphCount: number;
  listCount: number;
  codeBlockCount: number;
  mainContainerHits: number;
  articleHintHits: number;
  tocClues: number;
  commentBlockCount: number;
  usernameHits: number;
  timestampHits: number;
  replyWordHits: number;
  structuredSectionScore: number;
  nestedDiscussionScore: number;
}

export interface ClassificationResult {
  pageType: PageType;
  confidence: number;
  reasons: string[];
  metrics: ClassifierMetrics;
  scores: Record<PageType, number>;
  sourceHints: SourceHints;
}

export interface ExtractionDebug {
  headings: string[];
  removedSelectors: string[];
  removedCount: number;
  notes: string[];
  segmentCount: number;
}

export interface CleanedPage {
  title: string;
  sourceUrl: string;
  pageType: PageType;
  cleanedText: string;
  charCount: number;
  estimatedReadingTime: number;
  headings: string[];
  byline?: string;
  sourceHints?: SourceHints;
  threadModel?: ThreadModel;
  debug: ExtractionDebug;
}

export interface SummaryResult {
  shortSummary: string;
  takeaways: string[];
  whyThisMatters: string;
  selectedSentences: string[];
}

export interface PodcastTurn {
  speaker: "Host A" | "Host B";
  text: string;
  cue?: string;
}

export interface PodcastScript {
  title: string;
  turns: PodcastTurn[];
  script: string;
}

export interface ClassifiedPageResult {
  classification: ClassificationResult;
  cleaned: CleanedPage;
  summary: SummaryResult;
}

export interface VoiceSummary {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string | null;
  labels?: Record<string, string>;
}
