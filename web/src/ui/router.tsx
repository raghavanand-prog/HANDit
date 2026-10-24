// A tiny router on top of the History API: one path per screen, no library.
import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from "react";

type Guard = () => boolean;
let guard: Guard | null = null;

/** While set, in-app navigation asks first (for example, during a transfer). */
export function setLeaveGuard(next: Guard | null) {
  guard = next;
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

export function navigate(path: string, { replace = false } = {}) {
  if (path === location.pathname) return;
  if (guard && !guard()) return;
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.scrollTo(0, 0);
  notify();
}

export const usePath = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => location.pathname,
  );

export function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    )
      return;
    if (!href.startsWith("/")) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...props} />;
}
