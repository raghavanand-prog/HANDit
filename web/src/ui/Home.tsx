import { strings } from "../strings";

const bigButton =
  "rounded-2xl px-6 py-5 text-xl font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-4 py-12">
        <header className="space-y-4 text-center">
          <h1 className="text-5xl font-bold tracking-tight">{strings.appName}</h1>
          <p className="text-slate-600 dark:text-slate-400">{strings.pitch}</p>
        </header>
        <div className="grid gap-4">
          <button
            type="button"
            disabled
            className={`${bigButton} bg-slate-900 text-white dark:bg-white dark:text-slate-900`}
          >
            {strings.send}
          </button>
          <button
            type="button"
            disabled
            className={`${bigButton} border-2 border-slate-900 dark:border-white`}
          >
            {strings.receive}
          </button>
          <p className="text-center text-sm text-slate-500">{strings.underConstruction}</p>
        </div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-slate-500">{strings.auditLabel}</footer>
    </div>
  );
}
