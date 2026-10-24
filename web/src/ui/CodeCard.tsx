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
      <figure className="relative mx-auto max-w-sm -rotate-1 rounded-[2rem] bg-tag p-5 pt-11 text-tag-ink shadow-[0_18px_40px_-24px_rgba(23,32,51,0.55)] motion-reduce:rotate-0">
        {/* The tag's punched hole. */}
        <span
          aria-hidden="true"
          className="absolute top-4 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-paper ring-2 ring-tag-ink/25"
        />
        <div className="overflow-hidden rounded-2xl bg-white p-1">
          <QrCode text={link} />
        </div>
        <figcaption className="mt-4 text-center">
          <span className="block font-semibold">{instruction}</span>
          <span className="mt-1 flex items-center justify-center gap-3 text-sm">
            <span>{strings.code.worksOnce}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`tabular-nums ${urgent ? "rounded-md bg-tag-ink px-1.5 font-bold text-tag" : ""}`}
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
