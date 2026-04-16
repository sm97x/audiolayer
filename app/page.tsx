import Link from "next/link";
import { HeroPreview } from "@/components/hero-preview";

const useCases = [
  {
    title: "Articles",
    description: "Get the key points fast, then switch to the full story when you want more.",
  },
  {
    title: "Docs",
    description: "Hear the steps without listening to code blocks, menus, or sidebars.",
  },
  {
    title: "Threads",
    description: "Keep the main post and the best replies without the repeated noise.",
  },
];

const steps = [
  {
    title: "Open a page",
    description: "Use the Chrome extension on an article, documentation page, or discussion thread.",
  },
  {
    title: "Pick a mode",
    description: "Choose a quick summary, a full read, or a podcast-style recap.",
  },
  {
    title: "Listen",
    description: "AudioLayer sends the final narration to ElevenLabs and plays it back in the popup.",
  },
];

export default function HomePage() {
  return (
    <main className="px-5 pb-24 pt-6 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-full border hairline bg-white/70 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--foreground)] text-sm font-semibold text-white">
              AL
            </div>
            <div>
              <div className="text-sm font-semibold">AudioLayer</div>
              <div className="text-xs text-[var(--muted)]">The voice layer for the internet</div>
            </div>
          </div>
          <nav className="flex items-center gap-5 text-sm text-[var(--muted)]">
            <a href="#how-it-works">How it works</a>
            <a href="#modes">Modes</a>
            <Link href="/demo">Demo</Link>
          </nav>
        </header>

        <section className="grid gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="eyebrow">AudioLayer</div>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.02] sm:text-6xl">
              Turn articles, docs, and threads into audio.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              AudioLayer cleans the page, then lets you choose a quick summary, a full read,
              or a podcast-style recap.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white"
              >
                Try the demo
              </Link>
              <a
                href="https://github.com/sm97x/audiolayer"
                className="rounded-full border hairline px-5 py-3 text-sm font-medium"
              >
                View on GitHub
              </a>
            </div>
          </div>

          <HeroPreview />
        </section>

        <section className="grid gap-4 py-12 md:grid-cols-3">
          {useCases.map((card) => (
            <div key={card.title} className="panel rounded-[2rem] p-6">
              <div className="eyebrow">{card.title}</div>
              <h2 className="mt-4 text-2xl font-semibold">
                {card.title === "Articles"
                  ? "Get the key points fast"
                  : card.title === "Docs"
                    ? "Hear the steps without the clutter"
                    : "Keep the main post and best replies"}
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{card.description}</p>
            </div>
          ))}
        </section>

        <section id="how-it-works" className="grid gap-6 py-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="panel rounded-[2rem] p-6">
            <div className="eyebrow">How it works</div>
            <h2 className="mt-4 text-3xl font-semibold">Three steps from page to audio.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              The extension keeps the experience simple: open the page, choose the listen,
              and press play.
            </p>
          </div>
          <div className="grid gap-4">
            {steps.map((step, index) => (
              <div key={step.title} className="panel rounded-[1.75rem] px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Step {index + 1}
                </div>
                <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="modes" className="grid gap-6 py-12 lg:grid-cols-2">
          <div className="panel rounded-[2rem] p-6">
            <div className="eyebrow">Listening modes</div>
            <h2 className="mt-4 text-3xl font-semibold">Choose how much you want to hear.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              AudioLayer is not a raw read-aloud tool. It prepares the page for listening,
              then creates the right version for the moment.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="panel rounded-[1.75rem] p-5">
              <div className="text-sm font-semibold">Brief me</div>
              <div className="mt-2 text-sm leading-7 text-[var(--muted)]">
                A short version with the main point and the details worth remembering.
              </div>
            </div>
            <div className="panel rounded-[1.75rem] p-5">
              <div className="text-sm font-semibold">Read it</div>
              <div className="mt-2 text-sm leading-7 text-[var(--muted)]">
                The page body, cleaned up for narration.
              </div>
            </div>
            <div className="panel rounded-[1.75rem] p-5">
              <div className="text-sm font-semibold">Podcast mode</div>
              <div className="mt-2 text-sm leading-7 text-[var(--muted)]">
                A short two-host recap that talks through the page in plain language.
              </div>
            </div>
          </div>
        </section>

        <section className="panel rounded-[2rem] p-6">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="eyebrow">Built with ElevenLabs</div>
              <h2 className="mt-4 text-3xl font-semibold">Generated audio, with the API key kept server-side.</h2>
            </div>
            <p className="text-sm leading-7 text-[var(--muted)]">
              The Chrome extension sends page content to the local Next.js app. The app prepares
              the transcript and calls ElevenLabs from the server, so the browser extension never
              contains your API key.
            </p>
          </div>
        </section>

        <section className="py-12">
          <div className="panel rounded-[2rem] px-6 py-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="eyebrow">Try it</div>
                <h2 className="mt-4 text-3xl font-semibold">Start with the built-in sample pages.</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                  The demo includes one article, one docs page, and one discussion thread so you
                  can test every mode without installing the extension first.
                </p>
              </div>
              <Link
                href="/demo"
                className="rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white"
              >
                Open demo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
