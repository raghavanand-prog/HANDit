// Small shared pieces: buttons, headings, notices, the peer label.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Device } from "../core/rtc";
import { strings } from "../strings";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:opacity-90",
  secondary: "border-2 border-ink text-ink hover:bg-surface",
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
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizing} ${className}`}
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
