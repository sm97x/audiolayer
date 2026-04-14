import Link from "next/link";
import { HeroPreview } from "@/components/hero-preview";

const pageCards = [
  {
    title: "Articles",
    description:
      "Pull the thesis, key evidence, and payoff into a listen that sounds like an informed briefing, not a screen reader.",
  },
  {
    title: "Docs",
    description:
      "Preserve section hierarchy, bullets, and caveats while replacing code blocks with spoken placeholders that keep the listener oriented.",
  },
  {
    title: "Threads",
    description:
      "Keep the original post and strongest replies, then cut repetitive reactions, boilerplate, and recommendation sludge.",
  },
];

const steps = [
  "The extension captures the active tab's title, URL, HTML, and visible text.",
  "The backend classifies the page with deterministic DOM heuristics and runs the matching cleaner.",
  "Local summarization or dialogue templating turns the cleaned content into a spoken script.",
  "ElevenLabs generates the final MP3 with page-aware voice mapping and small in-memory caching.",
];

export default function HomePage() {
  return (
    <main className="px-5 pb-24 pt-6 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-full border hairline bg-white/70 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--foreground)] text-sm font-semibold text-white">
              SL
            </div>
            <div>
              <div className="text-sm font-semibold">AudioLayer</div>
              <div className="text-xs text-[var(--muted)]">The voice layer for the internet</div>
            </div>
          </div>
          <nav className="flex items-center gap-5 text-sm text-[var(--muted)]">
            <a href="#how-it-works">How it works</a>
            <a href="#architecture">Architecture</a>
            <Link href="/demo">Live demo</Link>
          </nav>
        </header>

        <section className="grid gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="eyebrow">Portfolio Prototype for ElevenLabs</div>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.02] sm:text-6xl">
              Audio that understands the page before it speaks.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              AudioLayer is a Chrome extension and Next.js backend that turns any page
              into a purpose-built listening experience. It classifies articles, docs, and
              threads, restructures each one for audio, and sends only the final narration
              or dialogue to ElevenLabs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white"
              >
                Open the demo
              </Link>
              <a
                href="#why-not-read-aloud"
                className="rounded-full border hairline px-5 py-3 text-sm font-medium"
              >
                Why this is different
              </a>
            </div>
          </div>

          <HeroPreview />
        </section>

        <section className="grid gap-4 py-12 md:grid-cols-3">
          {pageCards.map((card) => (
            <div key={card.title} className="panel rounded-[2rem] p-6">
              <div className="eyebrow">{card.title}</div>
              <h2 className="mt-4 text-2xl font-semibold">{card.title} get their own listening logic</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{card.description}</p>
            </div>
          ))}
        </section>

        <section id="how-it-works" className="grid gap-6 py-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="panel rounded-[2rem] p-6">
            <div className="eyebrow">How it works</div>
            <h2 className="mt-4 text-3xl font-semibold">A product demo, not a generic reader</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              The prototype is intentionally narrow: it focuses on believable v1 behavior that
              shows page understanding, local restructuring, and a strong ElevenLabs audio finish.
            </p>
          </div>
          <div className="grid gap-4">
            {steps.map((step, index) => (
              <div key={step} className="panel rounded-[1.75rem] px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Step {index + 1}
                </div>
                <div className="mt-2 text-base leading-7">{step}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="why-not-read-aloud" className="grid gap-6 py-12 lg:grid-cols-2">
          <div className="panel rounded-[2rem] p-6">
            <div className="eyebrow">Why not just read aloud?</div>
            <h2 className="mt-4 text-3xl font-semibold">Literal narration sounds competent and still feels bad.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              A blind DOM-to-voice pipeline turns every sidebar, footer, cookie prompt, and code
              block into friction. AudioLayer treats the page like structured material, then
              generates the right listening mode for that material.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="panel rounded-[1.75rem] p-5">
              <div className="text-sm font-semibold">Brief me</div>
              <div className="mt-2 text-sm leading-7 text-[var(--muted)]">
                A 45 to 90 second summary-first listen with takeaways and a clear why-this-matters line.
              </div>
            </div>
            <div className="panel rounded-[1.75rem] p-5">
              <div className="text-sm font-semibold">Read it</div>
              <div className="mt-2 text-sm leading-7 text-[var(--muted)]">
                Full cleaned narration that keeps the content and drops the page furniture.
              </div>
            </div>
            <div className="panel rounded-[1.75rem] p-5">
              <div className="text-sm font-semibold">Podcast mode</div>
              <div className="mt-2 text-sm leading-7 text-[var(--muted)]">
                A short, smart two-host recap generated locally from the page summary and debug signals.
              </div>
            </div>
          </div>
        </section>

        <section id="architecture" className="py-12">
          <div className="panel rounded-[2rem] p-6">
            <div className="eyebrow">Architecture</div>
            <h2 className="mt-4 text-3xl font-semibold">Three pieces, each with a clear job</h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <div className="rounded-[1.5rem] bg-[var(--panel-strong)] p-5">
                <div className="text-sm font-semibold">Chrome extension</div>
                <div className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  Captures the active page, shows classification confidence, and plays back MP3 audio with a transcript and debug panel.
                </div>
              </div>
              <div className="rounded-[1.5rem] bg-[var(--panel-strong)] p-5">
                <div className="text-sm font-semibold">Next.js backend</div>
                <div className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  Runs the heuristics: classification, cleaning, summarization, podcast scripting, normalization, and caching.
                </div>
              </div>
              <div className="rounded-[1.5rem] bg-[var(--panel-strong)] p-5">
                <div className="text-sm font-semibold">ElevenLabs audio layer</div>
                <div className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  Handles server-side TTS for Brief me and Read it plus multi-voice dialogue for Podcast mode.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12">
          <div className="eyebrow">Screens</div>
          <h2 className="mt-4 text-3xl font-semibold">Showable without explanation</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {["Popup overview", "Debug transcript", "Demo page"].map((label) => (
              <div key={label} className="panel grid-overlay rounded-[2rem] p-5">
                <div className="rounded-[1.4rem] border hairline bg-white/80 p-4">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-20 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    Visual placeholder for application materials
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel rounded-[2rem] px-6 py-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="eyebrow">Application CTA</div>
              <h2 className="mt-4 text-3xl font-semibold">Open the demo, load the extension, and record the flow.</h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                The repo includes a demo page, exact ElevenLabs setup, extension loading steps, tests for core logic, and a 90-second video script in the README.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white"
              >
                Open demo
              </Link>
              <a
                href="https://github.com/"
                className="rounded-full border hairline px-5 py-3 text-sm font-medium"
              >
                GitHub placeholder
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
