export function HeroPreview() {
  return (
    <div className="panel overflow-hidden rounded-[2rem]">
      <div className="border-b hairline px-5 py-4 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
        Extension preview
      </div>
      <div className="grid gap-4 p-5">
        <div className="rounded-[1.5rem] bg-[var(--panel-strong)] p-4 shadow-[0_14px_30px_rgba(17,17,17,0.05)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--foreground)] text-xs font-semibold text-white">
                AL
              </div>
              <div>
                <div className="text-sm font-semibold">AudioLayer</div>
                <div className="text-xs text-[var(--muted)]">The voice layer for the internet</div>
              </div>
            </div>
            <div className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
              Article
            </div>
          </div>
          <div className="mb-4 rounded-[1.25rem] bg-[var(--surface)] p-3">
            <div className="text-sm font-semibold">Why teams are rethinking web audio</div>
            <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Choose a quick summary, a full read, or a podcast-style recap.
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {["Brief me", "Read it", "Podcast mode"].map((mode) => (
              <div
                key={mode}
                className="rounded-full border hairline px-4 py-2 text-center text-sm font-medium"
              >
                {mode}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.5rem] bg-[var(--foreground)] px-4 py-4 text-white">
          <div className="text-xs uppercase tracking-[0.18em] text-white/55">Transcript</div>
          <div className="text-sm leading-6 text-white/86">
            The page argues that useful audio should keep the main idea, remove the clutter,
            and match the listening mode to the page.
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="ml-0.5 h-4 w-4 fill-white"
              >
                <path d="M8 5.25v13.5L18.5 12 8 5.25Z" />
              </svg>
            </div>
            <div className="h-2 flex-1 rounded-full bg-white/10">
              <div className="h-2 w-1/2 rounded-full bg-white" />
            </div>
            <div className="text-xs text-white/65">0:54</div>
          </div>
        </div>
      </div>
    </div>
  );
}
