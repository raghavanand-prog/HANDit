// The app shell: header, the current page, footer; settings and start-up clean-up.
import { useEffect, useMemo, useState } from "react";
import {
  type AuthState,
  firstName,
  loadAuth,
  SIGNED_OUT,
  signOut as signOutRequest,
} from "../core/auth";
import { defaultDeviceName, thisDevice, uaLabel } from "../core/device";
import type { LinkResult } from "../core/link";
import { cleanUpLeftovers } from "../core/save";
import { loadSettings, type Settings, saveSettings } from "../core/settings";
import { clearSharedFiles } from "../core/share";
import { missingFeatures } from "../core/support";
import { strings } from "../strings";
import { Account } from "./Account";
import { AppContext, type AppContextValue } from "./app-context";
import { Boundary } from "./Boundary";
import { Home } from "./Home";
import { About, Feedback, HelpIndex, HelpPage, HowItWorks, NotFound, Privacy } from "./info";
import { JoinPage, ReceivePage, SendPage, SettingsPage } from "./pages";
import { Link, navigate, usePath } from "./router";
import { ScanPage } from "./ScanPage";
import { SignInPage } from "./SignIn";

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
  if (path === "/signin") return <SignInPage />;
  if (path === "/about") return <About />;
  if (path === "/feedback") return <Feedback />;
  if (path === "/help") return <HelpIndex />;
  if (path.startsWith("/help/")) return <HelpPage code={path.slice(6)} />;
  return <NotFound />;
}

const footerLinks: [string, string][] = [
  ["/how-it-works", strings.nav.howItWorks],
  ["/privacy", strings.nav.privacy],
  ["/help", strings.nav.help],
  ["/feedback", strings.nav.feedback],
  ["/about", strings.nav.about],
];

/** Whether the browser thinks it has a network connection. */
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function App({ joinLink: openedWith }: { joinLink: LinkResult | null }) {
  const path = usePath();
  // A code opened from a link (read at start-up) or scanned with the in-page camera.
  const [joinLink, setJoinLink] = useState<LinkResult | null>(openedWith);
  const device = useMemo(thisDevice, []);
  const [settings, setSettingsState] = useState<Settings>(() =>
    loadSettings(defaultDeviceName(device)),
  );
  const unsupported = useMemo(missingFeatures, []);
  const online = useOnline();
  // The home and sign-in pages use the wide layout; working screens stay narrow and focused.
  const width = path === "/" || path === "/signin" ? "max-w-6xl" : "max-w-xl";
  const [auth, setAuth] = useState<AuthState>(SIGNED_OUT);
  useEffect(() => {
    void loadAuth().then(setAuth);
  }, []);

  useEffect(() => {
    // Received data from earlier visits is deleted (unless another open tab is using it).
    void cleanUpLeftovers();
    // A share that was never opened doesn't linger (an open /send?shared=… takes its own first).
    if (!location.search.includes("shared=")) void clearSharedFiles();
  }, []);

  // Signing in makes the device name friendlier ("Ravi's iPhone") if it is still the plain default.
  useEffect(() => {
    const plain = defaultDeviceName(device);
    if (auth.user && settings.name === plain) {
      const next = { ...settings, name: `${firstName(auth.user.name)}'s ${plain}`.slice(0, 40) };
      saveSettings(next);
      setSettingsState(next);
    }
  }, [auth.user, device, settings]);

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
      auth,
      signOut: async () => {
        await signOutRequest();
        setAuth(await loadAuth());
      },
    }),
    [settings, device, unsupported, auth],
  );

  return (
    <AppContext.Provider value={context}>
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-2 text-paper focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {strings.skipToContent}
      </a>
      {!online && (
        <p
          role="status"
          className="enter bg-danger-soft px-4 py-2 text-center text-sm font-medium text-danger"
        >
          {strings.offline}
        </p>
      )}
      <div aria-hidden="true" className="backdrop" />
      <div className="flex min-h-dvh flex-col">
        <header className={`mx-auto flex w-full items-center justify-between px-4 pt-5 ${width}`}>
          <Link
            href="/"
            className="-ml-2 inline-flex min-h-11 min-w-11 items-center px-2 font-display text-2xl font-extrabold tracking-tight"
          >
            HAND<span className="rounded-md bg-tag px-1.5 text-tag-ink">it</span>
          </Link>
          <div className="flex items-center gap-1">
            <Account />
            <Link
              href="/settings"
              aria-label={strings.nav.settings}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-accent-soft hover:text-ink"
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
          </div>
        </header>
        <main id="main" className={`mx-auto w-full flex-1 px-4 py-8 sm:py-12 ${width}`}>
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
        <footer className={`mx-auto w-full space-y-3 px-4 pb-8 text-sm text-muted ${width}`}>
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
