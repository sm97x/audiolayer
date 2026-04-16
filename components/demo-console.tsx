"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import type { PageType } from "@/lib/types";

export type GenerationMode = "brief" | "read" | "podcast";

interface ClassificationResponse {
  title: string;
  pageType: PageType;
  cleanedText: string;
  headings: string[];
  summaryPreview: string;
  takeaways: string[];
  whyThisMatters: string;
  debug?: {
    confidence?: number;
    reasons?: string[];
    scores?: Record<string, number>;
    cleanedCharCount?: number;
    estimatedReadingTime?: number;
    extraction?: {
      notes: string[];
      removedSelectors: string[];
      removedCount: number;
      segmentCount: number;
    };
  };
}

interface AudioResponse {
  audioBase64: string;
  mimeType: string;
  transcript?: string;
  script?: string;
}

export function getDemoButtonState(
  mode: GenerationMode,
  loadingMode: GenerationMode | null,
  hasClassification: boolean,
) {
  return {
    disabled: !hasClassification || loadingMode !== null,
    isLoading: loadingMode === mode,
  };
}

function getGenerationStatus(mode: GenerationMode | null): string {
  if (mode === "brief") {
    return "Making summary...";
  }

  if (mode === "read") {
    return "Reading page...";
  }

  if (mode === "podcast") {
    return "Creating podcast recap...";
  }

  return "Ready";
}

function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function DemoConsole() {
  const [selectedId, setSelectedId] = useState(DEMO_SAMPLES[0].id);
  const [classification, setClassification] = useState<ClassificationResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
  const [loadingMode, setLoadingMode] = useState<GenerationMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioUrlRef = useRef<string | null>(null);
  const classifyRequestIdRef = useRef(0);
  const generationRequestIdRef = useRef(0);
  const selectedIdRef = useRef(selectedId);

  const sample = DEMO_SAMPLES.find((item) => item.id === selectedId) ?? DEMO_SAMPLES[0];

  function replaceAudioUrl(nextUrl: string | null) {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = classifyRequestIdRef.current + 1;
    classifyRequestIdRef.current = requestId;
    generationRequestIdRef.current += 1;

    async function classifySample() {
      setIsClassifying(true);
      setLoadingMode(null);
      setError(null);
      setClassification(null);
      setTranscript("");
      replaceAudioUrl(null);

      try {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            url: `https://demo.audiolayer.local/${sample.id}`,
            html: sample.html,
            title: sample.title,
            includeDebug: true,
          }),
        });

        const data = (await response.json()) as ClassificationResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "This sample could not be prepared.");
        }

        if (classifyRequestIdRef.current !== requestId) {
          return;
        }

        setClassification(data);
        setTranscript(data.summaryPreview ?? "");
      } catch (caughtError) {
        if (controller.signal.aborted || classifyRequestIdRef.current !== requestId) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "This sample could not be prepared.");
        setTranscript("");
      } finally {
        if (classifyRequestIdRef.current === requestId) {
          setIsClassifying(false);
        }
      }
    }

    void classifySample();

    return () => {
      controller.abort();
    };
  }, [sample.html, sample.id, sample.title]);

  async function generate(mode: GenerationMode) {
    if (!classification || loadingMode) {
      return;
    }

    const requestId = generationRequestIdRef.current + 1;
    const activeSampleId = selectedIdRef.current;
    generationRequestIdRef.current = requestId;

    setLoadingMode(mode);
    setError(null);
    setTranscript("");
    replaceAudioUrl(null);

    try {
      const endpoint = mode === "podcast" ? "/api/podcast" : "/api/tts";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: classification.title,
          url: `https://demo.audiolayer.local/${sample.id}`,
          pageType: classification.pageType,
          cleanedText: classification.cleanedText,
          headings: classification.headings,
          debug: classification.debug?.extraction,
          mode: mode === "podcast" ? undefined : mode,
          responseType: "json",
        }),
      });

      const data = (await response.json()) as AudioResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Audio could not be generated.");
      }

      if (generationRequestIdRef.current !== requestId || selectedIdRef.current !== activeSampleId) {
        return;
      }

      replaceAudioUrl(base64ToObjectUrl(data.audioBase64, data.mimeType));
      setTranscript(data.transcript ?? data.script ?? "");
    } catch (caughtError) {
      if (generationRequestIdRef.current !== requestId || selectedIdRef.current !== activeSampleId) {
        return;
      }

      setError(caughtError instanceof Error ? caughtError.message : "Audio could not be generated.");
      setTranscript("");
    } finally {
      if (generationRequestIdRef.current === requestId && selectedIdRef.current === activeSampleId) {
        setLoadingMode(null);
      }
    }
  }

  function ModeButton({
    mode,
    label,
    primary = false,
  }: {
    mode: GenerationMode;
    label: string;
    primary?: boolean;
  }) {
    const state = getDemoButtonState(mode, loadingMode, Boolean(classification));

    return (
      <button
        type="button"
        onClick={() => void generate(mode)}
        disabled={state.disabled}
        aria-busy={state.isLoading}
        className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
          primary
            ? "bg-[var(--foreground)] text-white"
            : "border hairline bg-white/50 text-[var(--foreground)]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent ${
            state.isLoading ? "animate-spin opacity-100" : "opacity-0"
          }`}
        />
        <span>{label}</span>
      </button>
    );
  }

  const statusText = error
    ? "Something went wrong."
    : isClassifying
      ? "Checking page..."
      : loadingMode
        ? getGenerationStatus(loadingMode)
        : classification
          ? "Ready"
          : "Choose a sample.";

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="panel rounded-[2rem] p-5">
        <div className="mb-5">
          <div className="eyebrow">Sample pages</div>
          <h2 className="mt-2 text-2xl font-semibold">Choose a page type</h2>
        </div>

        <div className="grid gap-3">
          {DEMO_SAMPLES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedId(entry.id)}
              className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                entry.id === selectedId
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "hairline bg-[var(--panel-strong)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{entry.label}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {entry.pageType}
                </div>
              </div>
              <div className="mt-2 text-base font-medium">{entry.title}</div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{entry.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5">
        <div className="panel rounded-[2rem] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">Selected page</div>
              <h3 className="mt-2 text-2xl font-semibold">
                {classification?.title ?? sample.title}
              </h3>
            </div>
            <div className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)]">
              {isClassifying ? "Checking..." : classification?.pageType ?? sample.pageType}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-busy={loadingMode !== null}>
            <ModeButton mode="brief" label="Brief me" primary />
            <ModeButton mode="read" label="Read it" />
            <ModeButton mode="podcast" label="Podcast mode" />
          </div>

          <div className="mt-5 grid gap-4 rounded-[1.5rem] bg-[var(--panel-strong)] p-4">
            <div className="text-sm text-[var(--muted)]" role="status" aria-live="polite">
              {statusText}
            </div>

            {error ? (
              <div className="rounded-[1.25rem] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {audioUrl ? (
              <audio controls className="w-full">
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed hairline px-4 py-6 text-sm text-[var(--muted)]">
                Choose a mode to hear this page.
              </div>
            )}
          </div>
        </div>

        <div className="panel rounded-[2rem] p-5">
          <div className="mb-4">
            <div className="eyebrow">Transcript</div>
            <h3 className="mt-2 text-xl font-semibold">What you will hear</h3>
          </div>

          <div className="rounded-[1.5rem] bg-[var(--foreground)] p-4 text-sm leading-7 text-white">
            {transcript || "The transcript will appear here after you choose a mode."}
          </div>

          <details className="mt-4 rounded-[1.25rem] bg-[var(--surface)] p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Developer details
            </summary>
            <div className="mt-4 grid gap-4">
              <div className="text-sm leading-6 text-[var(--muted)]">
                {classification?.whyThisMatters ?? "Page notes will appear after the sample is ready."}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Takeaways
                </div>
                <ul className="mt-2 grid gap-2 text-sm leading-6">
                  {(classification?.takeaways ?? []).map((takeaway) => (
                    <li key={takeaway}>{takeaway}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Notes
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {(classification?.debug?.extraction?.notes ?? []).join(" ") || "No extra notes yet."}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Extracted text
                </div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[1rem] bg-white px-4 py-3 text-xs leading-6 text-[var(--muted)]">
                  {classification?.cleanedText ?? ""}
                </pre>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
