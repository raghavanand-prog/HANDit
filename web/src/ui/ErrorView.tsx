// Every failure: what happened, the likely reason, what to do next — plus Details and Help.
import type { ReactNode } from "react";
import type { HanditError } from "../core/codes";
import { messages, strings } from "../strings";
import { Link } from "./router";

export function ErrorView({
  error,
  what,
  why,
  next,
  children,
}: {
  error: HanditError;
  /** Replaces the standard first sentence (for messages with a name or a size in them). */
  what?: string;
  /** Replace the usual reason and next step (for messages that depend on the situation). */
  why?: string;
  next?: string;
  /** The actions for this code. */
  children?: ReactNode;
}) {
  const message = messages[error.code];
  return (
    <section aria-labelledby="error-title" className="space-y-5" data-code={error.code}>
      <div className="rounded-3xl border-l-8 border-danger bg-surface p-6">
        <h1
          id="error-title"
          tabIndex={-1}
          className="font-display text-2xl leading-snug font-bold outline-none"
        >
          {what ?? message.what}
        </h1>
        {(why ?? message.why) && <p className="mt-3 text-muted">{why ?? message.why}</p>}
        {(next ?? message.next) && <p className="mt-3 font-medium">{next ?? message.next}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
      <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">{strings.details}</summary>
        <dl className="mt-2 space-y-1 text-muted">
          <div>
            <dt className="inline">Code: </dt>
            <dd className="inline font-mono">{error.code}</dd>
          </div>
          {error.details && (
            <div>
              <dt className="inline">Details: </dt>
              <dd className="inline">{error.details}</dd>
            </div>
          )}
        </dl>
        <Link
          href={`/help/${error.code}`}
          className="mt-2 inline-block font-semibold text-ink underline underline-offset-4"
        >
          {strings.help}: {error.code}
        </Link>
      </details>
    </section>
  );
}
