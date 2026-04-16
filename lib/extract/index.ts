import { cleanArticle } from "@/lib/extract/cleanArticle";
import { cleanDocs } from "@/lib/extract/cleanDocs";
import { cleanThread } from "@/lib/extract/cleanThread";
import { classifyPage } from "@/lib/page-type";
import { payloadWithPdfText } from "@/lib/pdf";
import { detectSourceHints } from "@/lib/source-detection";
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

async function preparePayload(payload: PagePayload): Promise<PagePayload> {
  const sourceHints = detectSourceHints(payload);

  if (sourceHints.sourceKind !== "pdf") {
    return {
      ...payload,
      sourceHints,
    };
  }

  try {
    return await payloadWithPdfText({
      ...payload,
      sourceHints,
    });
  } catch (error) {
    const fallbackText = payload.selectedText?.trim() || payload.textContent?.trim() || "";
    if (fallbackText.length >= 500) {
      return {
        ...payload,
        textContent: fallbackText,
        html: undefined,
        sourceHints: {
          ...sourceHints,
          matchedRule: `${sourceHints.matchedRule ?? "pdf source"}; used visible text fallback`,
        },
      };
    }

    throw error;
  }
}

export async function classifyAndExtractPage(payload: PagePayload): Promise<ClassifiedPageResult> {
  const preparedPayload = await preparePayload(payload);
  const classification = classifyPage(preparedPayload);
  const payloadWithHints = {
    ...preparedPayload,
    sourceHints: classification.sourceHints,
  };
  const cleaned = cleanByPageType(payloadWithHints, classification.pageType);
  const summary = summarizePage(cleaned);

  return {
    classification,
    cleaned,
    summary,
  };
}
