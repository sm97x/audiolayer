import { DemoConsole } from "@/components/demo-console";

export default function DemoPage() {
  return (
    <main className="px-5 pb-20 pt-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-3xl">
          <div className="eyebrow">Demo</div>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.04]">
            Try AudioLayer with sample pages.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
            Pick a sample, then choose how you want to hear it.
          </p>
        </div>

        <DemoConsole />
      </div>
    </main>
  );
}
