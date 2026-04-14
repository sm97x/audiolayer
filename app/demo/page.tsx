import { DemoConsole } from "@/components/demo-console";

export default function DemoPage() {
  return (
    <main className="px-5 pb-20 pt-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-3xl">
          <div className="eyebrow">Interactive demo</div>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.04]">
            Run AudioLayer without loading the extension.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
            This page ships with three built-in sample pages so you can demonstrate classification,
            cleanup, summary generation, and ElevenLabs audio in one place.
          </p>
        </div>

        <DemoConsole />
      </div>
    </main>
  );
}
