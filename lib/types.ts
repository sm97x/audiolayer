export type PageType = "article" | "docs" | "thread";
export type ListenMode = "brief" | "read" | "podcast";

export interface PagePayload {
  url: string;
  html?: string;
  textContent?: string;
  title?: string;
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
