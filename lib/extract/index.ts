import { cleanArticle } from "@/lib/extract/cleanArticle";
import { cleanDocs } from "@/lib/extract/cleanDocs";
import { cleanThread } from "@/lib/extract/cleanThread";
import { classifyPage } from "@/lib/page-type";
import { summarizePage } from "@/lib/summarize";
import type { ClassifiedPageResult, CleanedPage, PagePayload, PageType } from "@/lib/types";

export function cleanByPageType(payload: PagePayload, pageType: PageType): CleanedPage {
  if (pageType === "docs") {
    return cleanDocs(payload);
  }

  if (pageType === "thread") {
    return cleanThread(payload);
  }

  return cleanArticle(payload);
}

export function classifyAndExtractPage(payload: PagePayload): ClassifiedPageResult {
  const classification = classifyPage(payload);
  const cleaned = cleanByPageType(payload, classification.pageType);
  const summary = summarizePage(cleaned);

  return {
    classification,
    cleaned,
    summary,
  };
}
