// The routes: Home, Send, Receive, the join page opened from a link, and Settings.
import { useCallback, useEffect, useRef, useState } from "react";
import { HanditError } from "../core/codes";
import { type LinkResult, Mode } from "../core/link";
import { fromFiles, merge, type Picked } from "../core/picked";
import { Session, type SessionOptions } from "../core/session";
import { LIFETIMES, type Lifetime, MAX_NAME_LENGTH } from "../core/settings";
import { takeSharedFiles } from "../core/share";
import { strings } from "../strings";
import { useApp } from "./app-context";
import { ErrorView } from "./ErrorView";
import { FilePicker } from "./FilePicker";
import { Button, Title } from "./parts";
import { Link, navigate } from "./router";
import { SessionView } from "./SessionView";

function useOptions(): SessionOptions {
  const { settings, me } = useApp();
  return {
    origin: location.origin,
    me,
    lifetime: settings.lifetime,
    confirmReceiver: settings.confirmReceiver,
  };
}

/** Runs one session at a time; leaving the page ends it (and deletes what it received). */
function useSessionSlot() {
  const [session, setSession] = useState<Session | null>(null);
  const current = useRef<Session | null>(null);
  const replace = useCallback((next: Session | null) => {
    void current.current?.dispose();
    current.current = next;
    setSession(next);
  }, []);
  useEffect(() => () => void current.current?.dispose(), []);
  return [session, replace] as const;
}

function Unsupported() {
  const { unsupported } = useApp();
  return (
    <ErrorView error={new HanditError("BROWSER_UNSUPPORTED", `Missing: ${unsupported.join(", ")}`)}>
      <Button variant="secondary" onClick={() => navigate("/")}>
        {strings.actions.home}
      </Button>
    </ErrorView>
  );
}

export function Home() {
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <h1
          tabIndex={-1}
          className="font-display text-6xl font-extrabold tracking-tight outline-none sm:text-7xl"
        >
          HAND<span className="rounded-xl bg-tag px-2 text-tag-ink">it</span>
        </h1>
        <p className="max-w-prose text-lg text-muted">{strings.pitch}</p>
      </header>
      <nav aria-label={`${strings.home.send} / ${strings.home.receive}`} className="grid gap-4">
        <Link
          href="/send"
          className="group block rounded-3xl bg-ink p-6 text-paper no-underline transition-opacity hover:opacity-95"
        >
          <span className="block font-display text-3xl font-bold">{strings.home.send}</span>
          <span className="mt-1 block opacity-80">{strings.home.sendHint}</span>
        </Link>
        <Link
          href="/receive"
          className="block rounded-3xl border-2 border-ink p-6 text-ink no-underline hover:bg-surface"
        >
          <span className="block font-display text-3xl font-bold">{strings.home.receive}</span>
          <span className="mt-1 block text-muted">{strings.home.receiveHint}</span>
        </Link>
      </nav>
      <p className="text-sm text-muted">{strings.home.laptopTip}</p>
      {typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function" && (
          <Link href="/scan" className="inline-block font-semibold underline underline-offset-4">
            {strings.scan.link}
          </Link>
        )}
    </div>
  );
}

export function SendPage() {
  const { unsupported } = useApp();
  const options = useOptions();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [session, setSession] = useSessionSlot();
  // Files shared into the installed app arrive as /send?shared=<id>.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("shared");
    if (!id) return;
    history.replaceState(null, "", "/send");
    void takeSharedFiles(id).then((files) =>
      setPicked((current) => merge(current, fromFiles(files))),
    );
  }, []);
  if (unsupported.length) return <Unsupported />;
  const start = () => setSession(Session.owner(options, Mode.SEND, picked));
  if (session) return <SessionView session={session} actions={{ restart: start }} />;
  return (
    <div className="space-y-6">
      <Title>{strings.send.title}</Title>
      <FilePicker
        picked={picked}
        onChange={setPicked}
        action={strings.send.showCode}
        onAction={start}
      />
    </div>
  );
}

export function ReceivePage() {
  const { unsupported } = useApp();
  const options = useOptions();
  const [session, setSession] = useSessionSlot();
  // biome-ignore lint/correctness/useExhaustiveDependencies: start once per visit
  const start = useCallback(() => setSession(Session.owner(options, Mode.RECEIVE)), []);
  useEffect(() => {
    if (!unsupported.length) start();
  }, [start, unsupported.length]);
  if (unsupported.length) return <Unsupported />;
  return session ? <SessionView session={session} actions={{ restart: start }} /> : null;
}

/** Opened from a scanned code or a shared link: /j#<payload> (read once, before rendering). */
export function JoinPage({ result }: { result: LinkResult }) {
  const { unsupported } = useApp();
  const options = useOptions();
  const [session, setSession] = useSessionSlot();
  // biome-ignore lint/correctness/useExhaustiveDependencies: start once per link
  const start = useCallback(() => {
    if (result.ok) setSession(Session.guest(options, result.link));
  }, []);
  useEffect(() => {
    if (!unsupported.length) start();
  }, [start, unsupported.length]);

  if (!result.ok) {
    return (
      <ErrorView error={new HanditError(result.code)}>
        {result.code === "LINK_UNSUPPORTED_VERSION" ? (
          <Button onClick={() => location.reload()}>{strings.actions.reload}</Button>
        ) : null}
        <Button variant="secondary" onClick={() => navigate("/")}>
          {strings.actions.home}
        </Button>
      </ErrorView>
    );
  }
  if (unsupported.length) return <Unsupported />;
  if (!session) return null;
  // The same link can be tried again only if this device never reached the Room.
  return <SessionView session={session} actions={{ retry: start }} />;
}

export function SettingsPage() {
  const { settings, setSettings } = useApp();
  const [name, setName] = useState(settings.name);
  const [saved, setSaved] = useState(false);
  const update = (change: Partial<typeof settings>) => {
    setSettings({ ...settings, ...change });
    setSaved(true);
  };
  return (
    <div className="space-y-8">
      <div>
        <Title>{strings.settings.title}</Title>
        <p className="mt-2 text-muted">{strings.settings.intro}</p>
      </div>
      <label className="block space-y-2">
        <span className="font-semibold">{strings.settings.name}</span>
        <input
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && update({ name: name.trim() })}
          className="block w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-lg focus:border-ink"
        />
        <span className="block text-sm text-muted">{strings.settings.nameHint}</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="font-semibold">{strings.settings.lifetime}</legend>
        <div className="grid grid-cols-3 gap-2">
          {LIFETIMES.map((seconds) => (
            <label
              key={seconds}
              className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm has-[:checked]:border-ink sm:text-base"
            >
              <input
                type="radio"
                name="lifetime"
                checked={settings.lifetime === seconds}
                onChange={() => update({ lifetime: seconds as Lifetime })}
                className="accent-[var(--ink)]"
              />
              {strings.settings.minutes(seconds / 60)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={settings.confirmReceiver}
          onChange={(e) => update({ confirmReceiver: e.target.checked })}
          className="mt-1 h-5 w-5 accent-[var(--ink)]"
        />
        <span>
          <span className="block font-semibold">{strings.settings.confirm}</span>
          <span className="block text-sm text-muted">{strings.settings.confirmHint}</span>
        </span>
      </label>
      <p role="status" className="text-sm text-verified">
        {saved ? strings.settings.saved : ""}
      </p>
    </div>
  );
}
