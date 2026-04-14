"use client";

import { useEffect, useState } from "react";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import type { PageType } from "@/lib/types";

interface ClassificationResponse {
  title: string;
  pageType: PageType;
  confidence: number;
  reasons: string[];
  cleanedText: string;
  cleanedCharCount: number;
  estimatedReadingTime: number;
  headings: string[];
  debug: {
    notes: string[];
    removedSelectors: string[];
    removedCount: number;
  };
  summaryPreview: string;
  takeaways: string[];
  whyThisMatters: string;
}

interface AudioResponse {
  audioBase64: string;
  mimeType: string;
  transcript?: string;
  script?: string;
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const sample = DEMO_SAMPLES.find((item) => item.id === selectedId) ?? DEMO_SAMPLES[0];

  useEffect(() => {
    async function classifySample() {
      setIsClassifying(true);
      setError(null);
      setClassification(null);

      try {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: `https://demo.audiolayer.local/${sample.id}`,
            html: sample.html,
            title: sample.title,
          }),
        });

        const data = (await response.json()) as ClassificationResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Classification failed.");
        }

        setClassification(data);
        setTranscript(data.summaryPreview);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Classification failed.");
      } finally {
        setIsClassifying(false);
      }
    }

    void classifySample();
  }, [sample.html, sample.id, sample.title]);

  async function generate(mode: "brief" | "read" | "podcast") {
    if (!classification) {
      return;
    }

    setIsGenerating(true);
    setError(null);

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
          debug: classification.debug,
          mode: mode === "podcast" ? undefined : mode,
          responseType: "json",
        }),
      });

      const data = (await response.json()) as AudioResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Audio generation failed.");
      }

      setAudioUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }

        return base64ToObjectUrl(data.audioBase64, data.mimeType);
      });

      setTranscript(data.transcript ?? data.script ?? "");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Audio generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="panel rounded-[2rem] p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="eyebrow">Sample Pages</div>
            <h2 className="mt-2 text-2xl font-semibold">Trigger the full pipeline</h2>
          </div>
          <div className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            Local heuristics only
          </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Detected page</div>
              <h3 className="mt-2 text-2xl font-semibold">
                {classification?.title ?? sample.title}
              </h3>
            </div>
            <div className="rounded-full border hairline px-4 py-2 text-sm">
              {isClassifying
                ? "Classifying..."
                : classification
                  ? `${classification.pageType} · ${classification.confidence.toFixed(2)}`
                  : "Waiting"}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void generate("brief")}
              disabled={!classification || isGenerating}
              className="rounded-full bg-[var(--foreground)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {isGenerating ? "Working..." : "Brief me"}
            </button>
            <button
              type="button"
              onClick={() => void generate("read")}
              disabled={!classification || isGenerating}
              className="rounded-full border hairline px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              Read it
            </button>
            <button
              type="button"
              onClick={() => void generate("podcast")}
              disabled={!classification || isGenerating}
              className="rounded-full border hairline px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              Podcast mode
            </button>
          </div>

          <div className="mt-5 grid gap-4 rounded-[1.5rem] bg-[var(--panel-strong)] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Cleaned length
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {classification?.cleanedCharCount.toLocaleString() ?? "0"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Reading time
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {classification?.estimatedReadingTime ?? 0} min
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Top reason
                </div>
                <div className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  {classification?.reasons[0] ?? "Inspecting DOM structure."}
                </div>
              </div>
            </div>

            {audioUrl ? (
              <audio controls className="w-full">
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed hairline px-4 py-6 text-sm text-[var(--muted)]">
                Generate audio to hear the selected sample.
              </div>
            )}
          </div>
        </div>

        <div className="panel rounded-[2rem] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="eyebrow">Transcript + Debug</div>
              <h3 className="mt-2 text-xl font-semibold">What AudioLayer would say</h3>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-[1.25rem] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="rounded-[1.5rem] bg-[var(--foreground)] p-4 text-sm leading-7 text-white">
            {transcript || "The generated transcript will appear here."}
          </div>

          <details className="mt-4 rounded-[1.25rem] bg-[var(--surface)] p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Inspect cleaned content and heuristics
            </summary>
            <div className="mt-4 grid gap-4">
              <div className="text-sm leading-6 text-[var(--muted)]">
                {classification?.whyThisMatters ?? "Why this matters will appear after classification."}
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
                  Cleaner notes
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {(classification?.debug.notes ?? []).join(" ")}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Cleaned text preview
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
