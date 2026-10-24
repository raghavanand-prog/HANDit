// Small shared pieces: buttons, headings, notices, the peer label.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Device } from "../core/rtc";
import { strings } from "../strings";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border-2 border-ink text-ink hover:bg-accent-soft",
  quiet: "text-ink underline underline-offset-4 decoration-line hover:decoration-ink",
  danger: "border-2 border-danger text-danger hover:bg-danger-soft",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg" }) {
  const sizing =
    variant === "quiet" ? "px-1 py-2" : size === "lg" ? "px-6 py-5 text-xl" : "px-5 py-3 text-base";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl min-h-12 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizing} ${className}`}
      {...props}
    />
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1
      tabIndex={-1}
      className="font-display text-3xl leading-tight font-bold tracking-tight outline-none sm:text-4xl"
    >
      {children}
    </h1>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  const look = tone === "warn" ? "border-warn text-ink" : "border-line text-ink";
  return <p className={`rounded-xl border-l-4 bg-surface px-4 py-3 text-sm ${look}`}>{children}</p>;
}

/** "Pixel 8 (Chrome)" with "name not verified" — names are claims, not proof. */
export function PeerName({ peer }: { peer: Device }) {
  return (
    <span>
      <strong className="font-semibold">
        <bdi>{strings.peer.label(peer.name, peer.ua)}</bdi>
      </strong>{" "}
      <span className="text-sm text-muted">({strings.nameNotVerified})</span>
    </span>
  );
}

export function PathLabel() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <LockIcon />
      {strings.pathLabel}
    </p>
  );
}

export function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 7h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6H6V4.5a2 2 0 1 1 4 0V7Z" />
    </svg>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none"
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-line bg-surface p-5 ${className}`}>{children}</div>
  );
}

type Tone = "accent" | "good" | "warn" | "bad";
const pillTones: Record<Tone, string> = {
  accent: "bg-accent-soft text-ink",
  good: "bg-verified-soft text-verified",
  warn: "bg-surface text-warn border border-warn",
  bad: "bg-danger-soft text-danger",
};

/** Where the transfer stands, in one word: it changes politely for screen readers. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${pillTones[tone]}`}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
      {children}
    </p>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  active,
}: {
  value: number;
  max: number;
  label: string;
  active: boolean;
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className="h-3.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className={`h-full rounded-full bg-accent transition-[width] duration-300 ease-out ${active ? "progress-sheen" : ""}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** An on/off setting with a switch, not a checkbox: it takes effect straight away. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full border-2 transition-colors ${checked ? "border-accent bg-accent" : "border-muted bg-surface"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full transition-transform duration-150 ${checked ? "translate-x-6 bg-accent-ink" : "bg-muted"}`}
        />
      </button>
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </div>
  );
}

/** A check that draws itself once: the restrained confirmation when a transfer completes. */
export function CheckMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-12 w-12 shrink-0">
      <circle
        cx="24"
        cy="24"
        r="22"
        className="fill-verified-soft stroke-verified"
        strokeWidth="3"
      />
      <path
        d="M14 25l7 7 13-15"
        className="check-draw fill-none stroke-verified"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
