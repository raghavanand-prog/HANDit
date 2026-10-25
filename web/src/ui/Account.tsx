// The header's account control: "Sign in" for a guest, a small menu for someone signed in.
import { useEffect, useRef, useState } from "react";
import { anyProvider, firstName } from "../core/auth";
import { strings } from "../strings";
import { useApp } from "./app-context";
import { Link, navigate } from "./router";

export function Account() {
  const { auth, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && box.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  if (!auth.ready || (!auth.user && !anyProvider(auth.providers))) return null;

  if (!auth.user) {
    return (
      <Link
        href="/signin"
        className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-ink hover:bg-accent-soft"
      >
        {strings.signin.signIn}
      </Link>
    );
  }

  const initial = (auth.user.name.trim()[0] ?? "?").toUpperCase();
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${strings.signin.account}: ${auth.user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-accent-soft"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display font-bold text-accent-ink"
        >
          {initial}
        </span>
        <span className="hidden max-w-28 truncate font-semibold sm:inline">
          <bdi>{firstName(auth.user.name)}</bdi>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="enter absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-surface p-3 shadow-xl"
        >
          <p className="px-2 pb-2 text-sm text-muted">
            {strings.signin.signedInAs("")}
            <strong className="text-ink">
              <bdi>{auth.user.name}</bdi>
            </strong>{" "}
            {strings.signin.via(auth.user.provider)}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate("/", { replace: true });
            }}
            className="flex min-h-11 w-full items-center rounded-xl px-2 text-left font-semibold hover:bg-accent-soft"
          >
            {strings.signin.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
