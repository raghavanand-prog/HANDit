// The home page: what HANDit is, the two things you can do, and why to trust it.
import type { ReactNode } from "react";
import { firstName } from "../core/auth";
import { strings } from "../strings";
import { useApp } from "./app-context";
import { HandoffScene } from "./HandoffScene";
import { Reveal } from "./motion";
import { Link } from "./router";

const iconClass = "h-7 w-7 fill-none stroke-current stroke-2";
const icons: ReactNode[] = [
  // a shield with a check: proven
  <svg
    key="proof"
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={iconClass}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6z" />
    <path className="check-draw-on-reveal" d="M8.5 12l2.5 2.5 4.5-5" />
  </svg>,
  // two points joined by a line: direct
  <svg
    key="direct"
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={iconClass}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5" cy="12" r="2.5" />
    <circle cx="19" cy="12" r="2.5" />
    <path d="M8 12h8" strokeDasharray="2 3" />
  </svg>,
  // a window: a web page
  <svg
    key="web"
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={iconClass}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 9h18M7 7h.01M10 7h.01" />
  </svg>,
];

export function Home() {
  const { auth } = useApp();
  const text = strings.home;
  return (
    <div className="space-y-24 sm:space-y-28">
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-7">
          <p className="enter inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-sm font-semibold">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-verified" />
            {text.badge}
          </p>
          {auth.user && (
            <p className="enter text-lg font-medium text-muted">
              {strings.signin.welcomeBack(firstName(auth.user.name))}
            </p>
          )}
          <h1
            tabIndex={-1}
            className="enter font-display text-5xl leading-[1.04] font-extrabold tracking-tight text-balance outline-none sm:text-6xl lg:text-7xl"
            style={{ animationDelay: "60ms" }}
          >
            {text.headline}
          </h1>
          <p
            className="enter max-w-xl text-lg text-muted sm:text-xl"
            style={{ animationDelay: "120ms" }}
          >
            {text.lead}
          </p>
          <div className="enter grid gap-3 sm:grid-cols-2" style={{ animationDelay: "180ms" }}>
            <Link
              href="/send"
              className="group flex min-h-16 flex-col justify-center rounded-3xl bg-accent px-6 py-4 text-accent-ink no-underline shadow-[0_14px_30px_-16px_var(--accent)] hover:opacity-95"
            >
              <span className="font-display text-2xl font-bold">{text.send}</span>
            </Link>
            <Link
              href="/receive"
              className="flex min-h-16 flex-col justify-center rounded-3xl border-2 border-ink px-6 py-4 text-ink no-underline hover:bg-accent-soft"
            >
              <span className="font-display text-2xl font-bold">{text.receive}</span>
            </Link>
          </div>
          <p className="enter max-w-xl text-sm text-muted" style={{ animationDelay: "220ms" }}>
            {text.laptopTip}
            {typeof navigator !== "undefined" &&
              typeof navigator.mediaDevices?.getUserMedia === "function" && (
                <>
                  {" "}
                  <Link
                    href="/scan"
                    className="font-semibold text-ink underline underline-offset-4"
                  >
                    {strings.scan.link}
                  </Link>
                </>
              )}
          </p>
          <ul className="enter flex flex-wrap gap-2" style={{ animationDelay: "260ms" }}>
            {text.chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium"
              >
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <div className="enter relative" style={{ animationDelay: "120ms" }}>
          <div
            aria-hidden="true"
            className="absolute inset-6 -z-10 rounded-[3rem] bg-accent-soft blur-3xl"
          />
          <HandoffScene />
        </div>
      </section>

      <section aria-labelledby="why" className="space-y-8">
        <Reveal>
          <h2 id="why" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {text.whyTitle}
          </h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {text.why.map((item, index) => (
            <Reveal key={item.title} delay={index * 90}>
              <article className="group h-full rounded-3xl border border-line bg-surface p-6 transition-transform duration-200 hover:-translate-y-1">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-ink transition-transform duration-200 group-hover:scale-105">
                  {icons[index]}
                </span>
                <h3 className="font-display text-xl font-bold">{item.title}</h3>
                <p className="mt-2 text-muted">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps" className="space-y-8">
        <Reveal>
          <h2 id="steps" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {text.stepsTitle}
          </h2>
        </Reveal>
        <ol className="grid gap-4 md:grid-cols-3">
          {text.steps.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 110} className="h-full">
                <div className="relative h-full rounded-3xl bg-ink p-6 text-paper">
                  <span
                    aria-hidden="true"
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-tag font-display text-lg font-extrabold text-tag-ink"
                  >
                    {index + 1}
                  </span>
                  <h3 className="font-display text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 opacity-80">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <Reveal>
        <section aria-labelledby="platforms" className="space-y-4 text-center">
          <h2 id="platforms" className="font-display text-2xl font-bold tracking-tight">
            {text.platformsTitle}
          </h2>
          <ul className="flex flex-wrap justify-center gap-2">
            {text.platforms.map((name) => (
              <li
                key={name}
                className="rounded-full border border-line bg-surface px-4 py-2 font-semibold"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      <Reveal>
        <section
          aria-labelledby="cta"
          className="rounded-[2rem] bg-accent px-6 py-12 text-center text-accent-ink sm:px-12"
        >
          <h2 id="cta" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {text.ctaTitle}
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/send"
              className="inline-flex min-h-12 items-center rounded-2xl bg-accent-ink px-6 py-3 text-lg font-bold text-accent no-underline hover:opacity-90"
            >
              {text.ctaSend}
            </Link>
            <Link
              href="/receive"
              className="inline-flex min-h-12 items-center rounded-2xl border-2 border-accent-ink px-6 py-3 text-lg font-bold text-accent-ink no-underline hover:bg-white/10"
            >
              {text.ctaReceive}
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
