// The app shell: header, the current page, footer; settings and start-up clean-up.
import { useEffect, useMemo, useState } from "react";
import { defaultDeviceName, thisDevice, uaLabel } from "../core/device";
import type { LinkResult } from "../core/link";
import { cleanUpLeftovers } from "../core/save";
import { loadSettings, type Settings, saveSettings } from "../core/settings";
import { clearSharedFiles } from "../core/share";
import { missingFeatures } from "../core/support";
import { strings } from "../strings";
import { AppContext, type AppContextValue } from "./app-context";
import { Boundary } from "./Boundary";
import {
  About,
  Feedback,
  HelpIndex,
  HelpPage,
  HowItWorks,
  Limitations,
  NotFound,
  Privacy,
} from "./info";
import { Home, JoinPage, ReceivePage, SendPage, SettingsPage } from "./pages";
import { Link, navigate, usePath } from "./router";
import { ScanPage } from "./ScanPage";

function Page({
  path,
  joinLink,
  onScanned,
}: {
  path: string;
  joinLink: LinkResult | null;
  onScanned: (result: LinkResult) => void;
}) {
  if (path === "/") return <Home />;
  if (path === "/send") return <SendPage />;
  if (path === "/receive") return <ReceivePage />;
  if (path === "/scan") return <ScanPage onLink={onScanned} />;
  if (path === "/j") {
    const result: LinkResult = joinLink ?? { ok: false, code: "LINK_INVALID" };
    return <JoinPage key={result.ok ? result.link.secret.join() : result.code} result={result} />;
  }
  if (path === "/settings") return <SettingsPage />;
  if (path === "/how-it-works") return <HowItWorks />;
  if (path === "/privacy") return <Privacy />;
  if (path === "/limitations") return <Limitations />;
  if (path === "/about") return <About />;
  if (path === "/feedback") return <Feedback />;
  if (path === "/help") return <HelpIndex />;
  if (path.startsWith("/help/")) return <HelpPage code={path.slice(6)} />;
  return <NotFound />;
}

const footerLinks: [string, string][] = [
  ["/how-it-works", strings.nav.howItWorks],
  ["/privacy", strings.nav.privacy],
  ["/limitations", strings.nav.limitations],
  ["/help", strings.nav.help],
  ["/feedback", strings.nav.feedback],
  ["/about", strings.nav.about],
];

export function App({ joinLink: openedWith }: { joinLink: LinkResult | null }) {
  const path = usePath();
  // A code opened from a link (read at start-up) or scanned with the in-page camera.
  const [joinLink, setJoinLink] = useState<LinkResult | null>(openedWith);
  const device = useMemo(thisDevice, []);
  const [settings, setSettingsState] = useState<Settings>(() =>
    loadSettings(defaultDeviceName(device)),
  );
  const unsupported = useMemo(missingFeatures, []);

  useEffect(() => {
    // Received data from earlier visits is deleted (unless another open tab is using it).
    void cleanUpLeftovers();
    // A share that was never opened doesn't linger (an open /send?shared=… takes its own first).
    if (!location.search.includes("shared=")) void clearSharedFiles();
  }, []);

  const context: AppContextValue = useMemo(
    () => ({
      settings,
      setSettings: (next: Settings) => {
        saveSettings(next);
        setSettingsState(next);
      },
      device,
      me: { name: settings.name, ua: uaLabel(device) },
      unsupported,
    }),
    [settings, device, unsupported],
  );

  return (
    <AppContext.Provider value={context}>
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-2 text-paper focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {strings.skipToContent}
      </a>
      <div className="flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-5">
          {path === "/" ? (
            <span />
          ) : (
            <Link href="/" className="font-display text-xl font-extrabold tracking-tight">
              HAND<span className="rounded-md bg-tag px-1 text-tag-ink">it</span>
            </Link>
          )}
          <Link
            href="/settings"
            aria-label={strings.nav.settings}
            className="rounded-xl p-2 text-muted hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6 fill-none stroke-current stroke-2"
            >
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </Link>
        </header>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
          <Boundary key={path}>
            <Page
              path={path}
              joinLink={joinLink}
              onScanned={(result) => {
                setJoinLink(result);
                navigate("/j", { replace: true });
              }}
            />
          </Boundary>
        </main>
        <footer className="mx-auto w-full max-w-xl space-y-3 px-4 pb-8 text-sm text-muted">
          <nav aria-label="Pages">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {footerLinks.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="underline-offset-4 hover:text-ink hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p>{strings.auditLabel}</p>
        </footer>
      </div>
    </AppContext.Provider>
  );
}
