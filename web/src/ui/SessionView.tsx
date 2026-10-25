// The screens of one session, chosen by its stage.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HanditError } from "../core/codes";
import { Mode } from "../core/link";
import { riskOf } from "../core/names";
import type { Picked } from "../core/picked";
import type { OfferItem } from "../core/protocol";
import {
  canSaveToFolder,
  canShare,
  download,
  type SavedFile,
  saveToFolder,
  share,
  zipName,
  zipOf,
} from "../core/save";
import type { Session, SessionState } from "../core/session";
import { messages, messageText, notices, strings } from "../strings";
import { useApp } from "./app-context";
import { CodeCard } from "./CodeCard";
import { ErrorView } from "./ErrorView";
import { FilePicker } from "./FilePicker";
import { formatBytes, formatDuration, formatKind } from "./format";
import {
  Button,
  Card,
  CheckMark,
  Notice,
  PathLabel,
  PeerName,
  ProgressBar,
  Spinner,
  StatusPill,
  Title,
} from "./parts";
import { navigate, setLeaveGuard } from "./router";

export interface SessionActions {
  /** Owner: start again with a fresh code (same files, if any). */
  restart?: () => void;
  /** Guest: try the same link again (only useful if it was never used). */
  retry?: () => void;
}

const BUSY: SessionState["stage"][] = [
  "connecting",
  "choosing",
  "confirming",
  "awaiting",
  "review",
  "transferring",
];

export function useSession(session: Session): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}

export function SessionView({ session, actions }: { session: Session; actions: SessionActions }) {
  const state = useSession(session);
  const heading = useRef<HTMLDivElement>(null);
  // Move focus to each new screen's heading, so screen readers follow along.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the screen changes
  useEffect(() => {
    heading.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [state.stage]);

  // When the page goes away, tell the other device now rather than let it time out.
  useEffect(() => {
    const leave = () => session.leave();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [session]);

  // Closing the tab or leaving the page mid-transfer asks first.
  const busy = BUSY.includes(state.stage);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = strings.leave;
    };
    window.addEventListener("beforeunload", warn);
    setLeaveGuard(() => window.confirm(strings.leave));
    return () => {
      window.removeEventListener("beforeunload", warn);
      setLeaveGuard(null);
    };
  }, [busy]);

  const status = statusFor(state);
  return (
    <div ref={heading} data-stage={state.stage}>
      {status && (
        <div className="mb-4">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
      )}
      <div key={state.stage} className="enter">
        <Stage state={state} session={session} actions={actions} />
      </div>
    </div>
  );
}

/** One word for where the transfer stands, for the pill at the top of each screen. */
function statusFor(
  state: SessionState,
): { tone: "accent" | "good" | "warn" | "bad"; label: string } | null {
  const text = strings.status;
  switch (state.stage) {
    case "preparing":
      return { tone: "accent", label: text.preparing };
    case "expired":
      return { tone: "warn", label: text.expired };
    case "joining":
    case "connecting":
      return { tone: "accent", label: text.connecting };
    case "choosing":
      return { tone: "accent", label: state.sending ? text.waitingForYou : text.waitingForThem };
    case "confirming":
    case "review":
      return { tone: "warn", label: text.waitingForYou };
    case "awaiting":
      return { tone: "accent", label: text.waitingForThem };
    case "transferring":
      return { tone: "accent", label: text.transferring };
    case "complete": {
      const t = state.transfer;
      const allOk = t && Object.values(t.outcomes).filter((o) => o.ok).length === t.totalFiles;
      return allOk ? { tone: "good", label: text.done } : { tone: "warn", label: text.partial };
    }
    case "failed":
      return { tone: "bad", label: text.failed };
    default:
      return null;
  }
}

function Stage({
  state,
  session,
  actions,
}: {
  state: SessionState;
  session: Session;
  actions: SessionActions;
}) {
  switch (state.stage) {
    case "preparing":
      return <Waiting title={strings.code.preparing} />;
    case "code":
      return (
        <div className="space-y-6">
          <Title>{state.mode === Mode.SEND ? strings.home.send : strings.home.receive}</Title>
          {state.link && state.expiresAt && (
            <CodeCard
              link={state.link}
              expiresAt={state.expiresAt}
              instruction={
                state.mode === Mode.SEND ? strings.code.scanToReceive : strings.code.scanToSend
              }
              receiving={state.mode === Mode.RECEIVE}
            />
          )}
          <Button variant="quiet" onClick={() => navigate("/")}>
            {strings.cancel}
          </Button>
        </div>
      );
    case "expired":
      return (
        <ErrorView error={new HanditError("CODE_EXPIRED")} what={strings.code.expired}>
          {actions.restart && <Button onClick={actions.restart}>{strings.code.newCode}</Button>}
          <Button variant="secondary" onClick={() => navigate("/")}>
            {strings.actions.home}
          </Button>
        </ErrorView>
      );
    case "joining":
    case "connecting":
      return state.peer && state.role === "owner" ? (
        <Joined state={state} line={strings.join.connecting} session={session} />
      ) : (
        <Waiting
          title={strings.join.connecting}
          hint={strings.join.connectingHint}
          session={session}
        />
      );
    case "choosing":
      return state.sending ? (
        <Choose session={session} />
      ) : (
        <Joined state={state} line={strings.peer.choosing} session={session} />
      );
    case "confirming":
      return <Confirm state={state} session={session} />;
    case "awaiting":
      return <Joined state={state} line={strings.peer.waitingAccept} session={session} />;
    case "review":
      return <Review state={state} session={session} />;
    case "transferring":
      return <Progress state={state} session={session} />;
    case "complete":
      return state.sending ? <Sent state={state} /> : <Received state={state} />;
    case "failed":
      return <Failed state={state} actions={actions} />;
  }
}

function Waiting({ title, hint, session }: { title: string; hint?: string; session?: Session }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3" role="status">
        <Spinner />
        <Title>{title}</Title>
      </div>
      {hint && <p className="text-muted">{hint}</p>}
      {session && (
        <Button variant="quiet" onClick={() => session.cancel()}>
          {strings.cancel}
        </Button>
      )}
    </div>
  );
}

function Joined({ state, line, session }: { state: SessionState; line: string; session: Session }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-surface p-6" role="status">
        {state.peer ? (
          <p className="text-lg">
            <PeerName peer={state.peer} /> {strings.peer.joined}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <Spinner />
          <Title>{state.peer ? line : strings.peer.waitingSender}</Title>
        </div>
      </div>
      <PathLabel />
      <Button variant="secondary" onClick={() => session.cancel()}>
        {strings.cancel}
      </Button>
    </div>
  );
}

function Choose({ session }: { session: Session }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const state = useSession(session);
  return (
    <div className="space-y-6">
      <Title>{strings.send.sendTo}</Title>
      {state.peer && (
        <p>
          <PeerName peer={state.peer} />
        </p>
      )}
      <p className="text-muted">{strings.send.sendToHint}</p>
      <FilePicker
        picked={picked}
        onChange={setPicked}
        action={strings.send.sendNow}
        onAction={() => session.choose(picked)}
      />
      <Button variant="quiet" onClick={() => session.cancel()}>
        {strings.cancel}
      </Button>
    </div>
  );
}

function Confirm({ state, session }: { state: SessionState; session: Session }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-surface p-6">
        <Title>{strings.peer.confirmTitle}</Title>
        {state.peer && (
          <p className="mt-3 text-lg">
            <PeerName peer={state.peer} />
          </p>
        )}
        <p className="mt-3 text-muted">{strings.peer.confirmHint}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => session.allow(true)}>{strings.peer.allow}</Button>
        <Button variant="secondary" onClick={() => session.allow(false)}>
          {strings.peer.dontAllow}
        </Button>
      </div>
    </div>
  );
}

const isPhoto = (x: OfferItem) =>
  x.type.startsWith("image/") ||
  /\.(heic|heif|jpe?g|png|dng|cr3|nef|arw|avif|webp|gif|tiff?)$/i.test(x.path);
const isVideo = (x: OfferItem) =>
  x.type.startsWith("video/") || /\.(mov|mp4|m4v|hevc|avi|mkv|webm|3gp)$/i.test(x.path);

/** "24 photos · 3 videos · 2 files". */
function mediaSummary(items: OfferItem[]): string[] {
  const files = items.filter((x) => x.kind === "file");
  const photos = files.filter(isPhoto).length;
  const videos = files.filter((x) => !isPhoto(x) && isVideo(x)).length;
  const others = files.length - photos - videos;
  return [
    ...(photos ? [strings.review.photos(photos)] : []),
    ...(videos ? [strings.review.videos(videos)] : []),
    ...(others ? [strings.review.files(others)] : []),
  ];
}

function Review({ state, session }: { state: SessionState; session: Session }) {
  const transfer = state.transfer;
  if (!transfer) return null;
  const items = transfer.items;
  const files = items.filter((x) => x.kind === "file");
  const tops = new Map<string, number>();
  for (const item of files) {
    const slash = item.path.indexOf("/");
    if (slash > 0)
      tops.set(item.path.slice(0, slash), (tops.get(item.path.slice(0, slash)) ?? 0) + 1);
  }
  const apps = items.filter((x) => riskOf(x.path.split("/").at(-1) ?? "") !== null);
  const disguised = items.filter((x) => riskOf(x.path.split("/").at(-1) ?? "") === "disguised");
  const storage = state.storage;

  return (
    <div className="space-y-5">
      <Title>{strings.review.title}</Title>
      {state.peer && (
        <p>
          {strings.review.from} <PeerName peer={state.peer} />
        </p>
      )}
      <p className="font-display text-xl font-semibold tabular-nums">
        {strings.review.summary([...mediaSummary(items), formatBytes(transfer.totalBytes)])}
      </p>
      {tops.size > 0 && (
        <ul className="text-sm text-muted">
          {[...tops].map(([name, count]) => (
            <li key={name}>
              <bdi>{strings.review.topLevel(name, count)}</bdi>
            </li>
          ))}
        </ul>
      )}
      <ul
        className="max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface"
        aria-label={strings.review.title}
      >
        {items.slice(0, 50).map((item) => {
          const risk = riskOf(item.path.split("/").at(-1) ?? "");
          return (
            <li key={item.i} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <bdi>{item.kind === "dir" ? `${item.path}/` : item.path}</bdi>
              </span>
              {risk && (
                <span className="shrink-0 rounded-md bg-danger-soft px-1.5 text-xs font-semibold text-danger">
                  {risk === "disguised" ? "!" : "app"}
                </span>
              )}
              <span className="shrink-0 text-muted tabular-nums">
                {item.kind === "file" ? formatBytes(item.size) : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {items.length > 50 && (
        <p className="text-sm text-muted">{strings.review.more(items.length - 50)}</p>
      )}
      {apps.length > 0 && (
        <Notice tone="warn">
          <strong>{strings.review.apps(apps.length)}.</strong> {strings.review.appsHint}
        </Notice>
      )}
      {disguised.length > 0 && (
        <Notice tone="warn">
          <strong>{strings.review.disguised(disguised.length)}.</strong>{" "}
          {strings.review.disguisedHint}
        </Notice>
      )}
      {!storage ? (
        <p className="text-sm text-muted">{strings.review.checkingStorage}</p>
      ) : !storage.ok ? (
        <Notice tone="warn">
          {messageText.storageTooSmall(
            formatBytes(storage.needed),
            formatBytes(storage.available ?? 0),
          )}{" "}
          {messages.STORAGE_TOO_SMALL.next}
        </Notice>
      ) : null}
      <p className="font-medium text-verified">{strings.review.quality}</p>
      <PathLabel />
      <div className="flex flex-wrap gap-3">
        <Button size="lg" disabled={!storage?.ok} onClick={() => session.accept()}>
          {strings.review.accept}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => session.decline()}>
          {strings.review.decline}
        </Button>
      </div>
      <p className="text-sm text-muted">{strings.review.countdown(120)}</p>
    </div>
  );
}

function Progress({ state, session }: { state: SessionState; session: Session }) {
  const t = state.transfer;
  if (!t) return null;
  const current = Math.min(t.filesDone + 1, Math.max(t.totalFiles, 1));
  const done = t.bytes >= t.totalBytes;
  const left = state.rate && state.rate > 0 ? (t.totalBytes - t.bytes) / state.rate : undefined;
  const line = state.sending
    ? strings.progress.sending(current, t.totalFiles)
    : strings.progress.receiving(current, t.totalFiles);
  return (
    <div className="space-y-5">
      <Title>{done ? strings.progress.verifying : line}</Title>
      <Route state={state} />
      <div className="space-y-2">
        <ProgressBar value={t.bytes} max={t.totalBytes} label={line} active={!done} />
        <p className="flex flex-wrap justify-between gap-x-4 text-sm tabular-nums" role="status">
          <span>
            {strings.progress.bytes(
              formatBytes(Math.min(t.bytes, t.totalBytes)),
              formatBytes(t.totalBytes),
            )}
          </span>
          <span className="text-muted">
            {left !== undefined && !done ? strings.progress.left(formatDuration(left)) : ""}
          </span>
        </p>
      </div>
      <PathLabel />
      <Button variant="danger" onClick={() => session.cancel()}>
        {strings.cancel}
      </Button>
    </div>
  );
}

/** Source, destination and contents of the transfer, always in the same place. */
function Route({ state }: { state: SessionState }) {
  const items = state.transfer?.items ?? [];
  const peer = state.peer;
  const mine = <span className="font-semibold">{strings.route.thisDevice}</span>;
  const theirs = peer ? (
    <span>
      <span className="font-semibold">
        <bdi>{peer.name}</bdi>
      </span>
      <span className="block text-sm text-muted">{peer.ua}</span>
      <span className="block text-sm text-muted">{strings.nameNotVerified}</span>
    </span>
  ) : null;
  const endpoint = (label: string, who: React.ReactNode) => (
    <div className="min-w-0 flex-1">
      <p className="text-sm text-muted">{label}</p>
      {who}
    </div>
  );
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        {endpoint(strings.route.from, state.sending ? mine : theirs)}
        <span aria-hidden="true" className="text-2xl text-muted">
          →
        </span>
        {endpoint(strings.route.to, state.sending ? theirs : mine)}
      </div>
      {items.length > 0 && (
        <p className="border-t border-line pt-3 text-sm">
          <span className="text-muted">{strings.route.contents}: </span>
          {mediaSummary(items).join(" · ")} · {formatBytes(state.transfer?.totalBytes ?? 0)}
        </p>
      )}
    </Card>
  );
}

function Badge({ allOk, ok, total }: { allOk: boolean; ok: number; total: number }) {
  return allOk ? (
    <p className="stamp inline-flex items-center rounded-full bg-verified-soft px-5 py-2.5 font-display text-lg font-semibold text-balance text-verified">
      {strings.complete.badge}
    </p>
  ) : (
    <p className="inline-flex items-center rounded-full border border-warn px-5 py-2.5 font-display text-lg font-semibold text-warn">
      {strings.complete.partial(ok, total, total - ok)}
    </p>
  );
}

function Finished({ state }: { state: SessionState }) {
  if (!state.finishedAt) return null;
  const time = new Date(state.finishedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return <p className="text-sm text-muted">{strings.route.finishedAt(time)}</p>;
}

function Sent({ state }: { state: SessionState }) {
  const t = state.transfer;
  if (!t) return null;
  const ok = Object.values(t.outcomes).filter((o) => o.ok).length;
  const allOk = ok === t.totalFiles;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {allOk && <CheckMark />}
        <Title>{strings.complete.sent}</Title>
      </div>
      <Badge allOk={allOk} ok={ok} total={t.totalFiles} />
      <Route state={state} />
      <Finished state={state} />
      {allOk && <p className="text-muted">{notices.QUALITY_IDENTICAL}</p>}
      <FileResults items={t.items} outcomes={t.outcomes} />
      <Button onClick={() => navigate("/")}>{strings.done}</Button>
    </div>
  );
}

function Received({ state }: { state: SessionState }) {
  const { device } = useApp();
  const t = state.transfer;
  if (!t) return null;
  const ok = Object.values(t.outcomes).filter((o) => o.ok).length;
  const allOk = ok === t.totalFiles;
  const heic = device.os === "Windows" && t.items.some((x) => /\.(heic|heif)$/i.test(x.path));
  const media = mediaSummary(t.items);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {allOk && <CheckMark />}
        <Title>
          {media.length
            ? strings.complete.receivedMedia(media)
            : strings.complete.received(t.items.length)}
        </Title>
      </div>
      <Badge allOk={allOk} ok={ok} total={t.totalFiles} />
      <Route state={state} />
      <Finished state={state} />
      {allOk && <p className="text-muted">{notices.QUALITY_IDENTICAL}</p>}
      {heic && <Notice>{notices.INFO_HEIC_ON_WINDOWS}</Notice>}
      <SaveOptions saved={state.saved ?? []} folders={state.folders ?? []} items={t.items} />
      <FileResults items={t.items} outcomes={t.outcomes} />
      <Button variant="secondary" onClick={() => navigate("/")}>
        {strings.done}
      </Button>
    </div>
  );
}

function SaveOptions({
  saved,
  folders,
  items,
}: {
  saved: SavedFile[];
  folders: OfferItem[];
  items: OfferItem[];
}) {
  const [status, setStatus] = useState<string>("");
  const [individual, setIndividual] = useState(0);
  if (saved.length === 0 && folders.length === 0) return null;
  const files = saved.map((s) => s.file);
  const single = saved.length === 1 && folders.length === 0 ? saved[0] : undefined;
  const attempt = async (action: () => Promise<void> | void, done = "") => {
    try {
      await action();
      setStatus(done);
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") setStatus(strings.complete.saveError);
    }
  };
  return (
    <section className="space-y-3" aria-label={strings.complete.save}>
      <div className="flex flex-wrap gap-3">
        {single ? (
          <Button size="lg" onClick={() => attempt(() => download(single.file, single.file.name))}>
            {strings.complete.save}
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={() => attempt(() => download(zipOf(saved, folders), zipName(items)))}
          >
            {strings.complete.downloadAll}
          </Button>
        )}
        {canShare(files) && (
          <Button size="lg" variant="secondary" onClick={() => attempt(() => share(files))}>
            {strings.complete.share}
          </Button>
        )}
        {canSaveToFolder() && !single && (
          <Button
            variant="secondary"
            onClick={() =>
              attempt(() => saveToFolder(saved, folders), strings.complete.savedFolder)
            }
          >
            {strings.complete.saveFolder}
          </Button>
        )}
      </div>
      {canShare(files) && <p className="text-sm text-muted">{strings.complete.shareHint}</p>}
      {!single && saved.length > 1 && (
        <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">{strings.complete.saveEach}</summary>
          <ul className="mt-2 space-y-1">
            {saved.map((s) => (
              <li key={s.item.i}>
                <button
                  type="button"
                  className="text-left underline underline-offset-4"
                  onClick={() => {
                    setIndividual((n) => n + 1);
                    download(s.file, s.file.name);
                  }}
                >
                  {strings.complete.save} <bdi>{s.item.path}</bdi>
                </button>
              </li>
            ))}
          </ul>
          {individual > 1 && <p className="mt-2 text-muted">{strings.complete.blockedHint}</p>}
        </details>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}

function FileResults({
  items,
  outcomes,
}: {
  items: OfferItem[];
  outcomes: Record<number, { ok: boolean; code?: string }>;
}) {
  const files = items.filter((x) => x.kind === "file");
  return (
    <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">{strings.details}</summary>
      <ul className="mt-2 divide-y divide-line">
        {files.map((item) => {
          const outcome = outcomes[item.i];
          const name = item.path.split("/").at(-1) ?? item.path;
          const failure =
            outcome && !outcome.ok
              ? outcome.code === "SOURCE_UNREADABLE"
                ? messageText.sourceUnreadable(name)
                : messageText.integrityFailed(name)
              : null;
          return (
            <li key={item.i} className="flex items-start gap-3 py-2">
              <span aria-hidden="true" className={outcome?.ok ? "text-verified" : "text-danger"}>
                {outcome?.ok ? "✓" : "✕"}
              </span>
              <span className="min-w-0 flex-1">
                <bdi className="block truncate">{item.path}</bdi>
                <span className="text-muted">
                  {formatKind(name, item.type)} · {formatBytes(item.size)} ·{" "}
                  {outcome?.ok ? strings.complete.fileOk : (failure ?? strings.complete.fileFailed)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Failed({ state, actions }: { state: SessionState; actions: SessionActions }) {
  const error = state.error ?? new HanditError("UNKNOWN_ERROR");
  const code = error.code;
  const recipientTimeout = code === "OFFER_TIMEOUT" && !state.sending;
  // The Room refused because this network used up its per-IP allowance (close code 4429).
  const rateLimited = code === "UNKNOWN_ERROR" && error.details.includes("4429");
  const finished = state.saved ?? [];
  const tryAgain = actions.restart ?? actions.retry;
  const action = (() => {
    switch (code) {
      case "LINK_UNSUPPORTED_VERSION":
        return <Button onClick={() => location.reload()}>{strings.actions.reload}</Button>;
      case "SERVER_UNREACHABLE":
      case "P2P_FAILED":
      case "UNKNOWN_ERROR":
        return tryAgain ? <Button onClick={tryAgain}>{strings.actions.tryAgain}</Button> : null;
      case "CANCELLED_BY_USER":
        // Refused or cancelled: the device that owns the code can show a fresh one.
        return state.role === "owner" && actions.restart ? (
          <Button onClick={actions.restart}>{strings.actions.newCode}</Button>
        ) : null;
      case "CONNECTION_LOST":
      case "PEER_LEFT":
        return state.sending && actions.restart ? (
          <Button onClick={actions.restart}>{strings.actions.sendAgain}</Button>
        ) : null;
      default:
        return null;
    }
  })();
  return (
    <div className="space-y-6">
      <ErrorView
        error={error}
        what={
          recipientTimeout
            ? messageText.offerTimeoutRecipient
            : rateLimited
              ? messageText.tooManyCodes.what
              : undefined
        }
        why={rateLimited ? messageText.tooManyCodes.why : undefined}
        next={rateLimited ? messageText.tooManyCodes.next : undefined}
      >
        {action}
        <Button variant="secondary" onClick={() => navigate("/")}>
          {strings.actions.home}
        </Button>
      </ErrorView>
      {!state.sending && finished.length > 0 && state.transfer && (
        <SaveOptions saved={finished} folders={[]} items={state.transfer.items} />
      )}
      {state.transfer && state.transfer.phase === "failed" && state.transfer.bytes > 0 && (
        <FileResults items={state.transfer.items} outcomes={state.transfer.outcomes} />
      )}
    </div>
  );
}
