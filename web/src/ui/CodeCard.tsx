// The code: a marigold hand-off tag holding the QR, the countdown and Copy link.
import { useEffect, useState } from "react";
import { linkSharingReceive, notices, strings } from "../strings";
import { formatCountdown } from "./format";
import { Button } from "./parts";
import { QrCode } from "./QrCode";

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function CodeCard({
  link,
  expiresAt,
  instruction,
  receiving = false,
}: {
  link: string;
  expiresAt: number;
  instruction: string;
  /** A receive code: the person who opens it sends files here. */
  receiving?: boolean;
}) {
  const now = useNow();
  const left = expiresAt - now;
  const urgent = left <= 15_000;
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <div className="space-y-6">
      <figure className="relative mx-auto max-w-sm rounded-[2rem] bg-tag p-6 text-tag-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]">
        <div className="overflow-hidden rounded-3xl bg-white p-1.5">
          <QrCode text={link} />
        </div>
        <figcaption className="mt-4 text-center">
          <span className="block font-semibold">{instruction}</span>
          <span className="mt-1 flex items-center justify-center gap-3 text-sm">
            <span>{strings.code.worksOnce}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`tabular-nums ${urgent ? "rounded-md bg-tag-ink px-1.5 font-semibold text-tag" : ""}`}
              data-testid="countdown"
            >
              {strings.code.expiresIn(formatCountdown(left))}
            </span>
          </span>
        </figcaption>
      </figure>
      <p className="sr-only" aria-live="assertive">
        {urgent && left > 0 ? strings.code.secondsLeft(15) : ""}
      </p>

      <p className="text-center text-sm text-muted">{strings.code.trust}</p>

      <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <Button variant="secondary" className="w-full" onClick={copyLink}>
          {copy === "copied" ? strings.code.copied : strings.code.copyLink}
        </Button>
        <p className="text-sm text-muted">
          {receiving ? linkSharingReceive : notices.INFO_LINK_SHARING}
        </p>
        {copy === "failed" && (
          <label className="block text-sm">
            {strings.code.copyFailed}
            <input
              readOnly
              value={link}
              aria-label={strings.code.linkLabel}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-2 py-1 font-mono text-xs"
            />
          </label>
        )}
      </div>
    </div>
  );
}
