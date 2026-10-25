// The public pages: How it works, Privacy, Known limitations, About, Feedback and Help.
import { ERROR_CODES, type ErrorCode } from "../core/codes";
import { help, messages, pages, REPOSITORY, strings } from "../strings";
import { Title } from "./parts";
import { Link } from "./router";

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="max-w-prose space-y-4 leading-relaxed">{children}</div>;
}

export function HowItWorks() {
  const page = pages.howItWorks;
  return (
    <Prose>
      <Title>{page.title}</Title>
      <ol className="space-y-5">
        {page.steps.map(([title, text], n) => (
          <li key={title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-display font-semibold text-paper"
            >
              {n + 1}
            </span>
            <span>
              <strong className="block font-display text-lg">{title}</strong>
              <span className="text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <ul className="list-disc space-y-2 pl-5">
        {page.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <p>
        <Link href="/privacy" className="font-semibold underline underline-offset-4">
          {pages.privacy.title}
        </Link>{" "}
        ·{" "}
        <Link href="/limitations" className="font-semibold underline underline-offset-4">
          {pages.limitations.title}
        </Link>
      </p>
    </Prose>
  );
}

export function Privacy() {
  const page = pages.privacy;
  return (
    <Prose>
      <Title>{page.title}</Title>
      <ul className="list-disc space-y-2 pl-5">
        {page.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <h2 className="font-display text-xl font-bold">{page.ipTitle}</h2>
      <p>{page.ip}</p>
      <h2 className="font-display text-xl font-bold">{page.feedbackTitle}</h2>
      <p>{page.feedback}</p>
    </Prose>
  );
}

export function About() {
  const page = pages.about;
  return (
    <Prose>
      <Title>{page.title}</Title>
      {page.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p className="font-semibold">{strings.auditLabel}</p>
      <h2 className="font-display text-xl font-bold">{page.officialTitle}</h2>
      <p>{page.official}</p>
      <p>
        <a href={REPOSITORY} className="font-semibold underline underline-offset-4" rel="noopener">
          {page.source}
        </a>
      </p>
      <p className="text-muted">{page.credits}</p>
    </Prose>
  );
}

export function Feedback() {
  const page = pages.feedback;
  const links: [string, string, string][] = [
    [page.bug, page.bugHint, `${REPOSITORY}/issues/new?template=bug.yml`],
    [page.worked, page.workedHint, `${REPOSITORY}/issues/new?template=report.yml`],
  ];
  return (
    <Prose>
      <Title>{page.title}</Title>
      <p>{page.intro}</p>
      <ul className="space-y-3">
        {links.map(([label, hint, href]) => (
          <li key={href} className="rounded-2xl border border-line bg-surface p-4">
            <a
              href={href}
              rel="noopener"
              className="font-display text-lg font-bold underline underline-offset-4"
            >
              {label}
            </a>
            <p className="text-sm text-muted">{hint}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">{page.public}</p>
    </Prose>
  );
}

export function HelpIndex() {
  return (
    <Prose>
      <Title>{pages.help.title}</Title>
      <p>{pages.help.intro}</p>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {ERROR_CODES.map((code) => (
          <li key={code}>
            <Link href={`/help/${code}`} className="block px-4 py-3 hover:bg-accent-soft">
              <span className="block font-semibold">{messages[code].what}</span>
              <span className="font-mono text-sm text-muted">{code}</span>
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="font-display text-xl font-bold">{pages.help.goodToKnow}</h2>
      <ol className="list-decimal space-y-2 pl-5">
        {pages.limitations.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </Prose>
  );
}

export function HelpPage({ code }: { code: string }) {
  if (!(ERROR_CODES as readonly string[]).includes(code))
    return <NotFound text={pages.help.notFound} />;
  const message = messages[code as ErrorCode];
  return (
    <Prose>
      <p className="font-mono text-sm text-muted">{code}</p>
      <Title>{message.what}</Title>
      {message.why && <p className="text-muted">{message.why}</p>}
      {message.next && <p className="font-semibold">{message.next}</p>}
      {(help[code as ErrorCode] ?? []).map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p>
        <Link href="/help" className="underline underline-offset-4">
          {pages.help.title}
        </Link>
      </p>
    </Prose>
  );
}

export function NotFound({ text = pages.notFound.body }: { text?: string }) {
  return (
    <Prose>
      <Title>{pages.notFound.title}</Title>
      <p>{text}</p>
      <Link href="/" className="font-semibold underline underline-offset-4">
        {strings.backHome}
      </Link>
    </Prose>
  );
}
