import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import { htmlFromText, normalizeLineBreaks, normalizeWhitespace } from "@/lib/extract/common";
import type { PagePayload } from "@/lib/types";

const MAX_PDF_BYTES = 18 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 60_000;
const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
let pdfWorkerConfigured = false;

export interface PdfExtractionResult {
  title: string;
  text: string;
  pageCount?: number;
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "PDF document";
    return decodeURIComponent(lastSegment.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ")).trim() || "PDF document";
  } catch {
    return "PDF document";
  }
}

function normalizePdfText(text: string): string {
  return normalizeLineBreaks(
    text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/-\n(?=[a-z])/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => normalizeWhitespace(line))
      .join("\n"),
  ).slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

function configurePdfWorker(): void {
  if (pdfWorkerConfigured) {
    return;
  }

  const workerPath = requireFromProject.resolve(["pdfjs-dist", "legacy", "build", "pdf.worker.mjs"].join("/"));
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  pdfWorkerConfigured = true;
}

export async function extractPdfFromBuffer(buffer: Buffer, fallbackTitle: string): Promise<PdfExtractionResult> {
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error("This PDF is too large to process locally.");
  }

  configurePdfWorker();
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const text = normalizePdfText(result.text ?? "");

    if (text.length < 40) {
      throw new Error("AudioLayer could not extract enough readable text from this PDF.");
    }

    return {
      title: fallbackTitle,
      text,
      pageCount: result.pages?.length,
    };
  } finally {
    await parser.destroy();
  }
}

export async function fetchAndExtractPdf(url: string, fallbackTitle?: string): Promise<PdfExtractionResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/pdf,*/*;q=0.8",
      },
    });
  } catch {
    throw new Error("AudioLayer could not fetch this PDF. Try downloading it or opening a public PDF URL.");
  }

  if (!response.ok) {
    throw new Error(`AudioLayer could not fetch this PDF. The server returned ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/pdf|octet-stream/i.test(contentType)) {
    throw new Error("This link did not return a PDF file.");
  }

  const arrayBuffer = await response.arrayBuffer();
  return extractPdfFromBuffer(Buffer.from(arrayBuffer), fallbackTitle || titleFromUrl(url));
}

export async function payloadWithPdfText(payload: PagePayload): Promise<PagePayload> {
  const extracted = await fetchAndExtractPdf(payload.url, payload.title);

  return {
    ...payload,
    title: payload.title || extracted.title,
    textContent: extracted.text,
    html: htmlFromText(extracted.text, payload.title || extracted.title),
    sourceHints: {
      ...payload.sourceHints,
      sourceKind: "pdf",
      pageIntentHint: "docs",
      matchedRule: "pdf text extraction",
    },
  };
}
