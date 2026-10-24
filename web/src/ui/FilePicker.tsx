// Picking what to send: drop zone, "Choose files", "Choose a folder", the list and totals.
// File inputs never use the accept attribute, so the browser hands over originals.
import { type DragEvent, useRef, useState } from "react";
import { fromDrop, fromFiles, merge, type Picked, totals } from "../core/picked";
import { MAX_ITEMS } from "../core/protocol";
import { messages, notices, strings } from "../strings";
import { useApp } from "./app-context";
import { formatBytes } from "./format";
import { Button, Notice } from "./parts";

const SHOWN = 50;

export function FilePicker({
  picked,
  onChange,
  action,
  onAction,
}: {
  picked: Picked[];
  onChange: (picked: Picked[]) => void;
  action: string;
  onAction: () => void;
}) {
  const { device } = useApp();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const { count, bytes } = totals(picked);
  const tooMany = count > MAX_ITEMS;
  const isApple = device.os === "iPhone" || device.os === "iPad";
  const androidPhotos =
    device.os === "Android" && picked.some((p) => p.file?.type.startsWith("image/"));

  const add = (added: Picked[]) => onChange(merge(picked, added));
  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    setReading(true);
    try {
      add(await fromDrop(event.dataTransfer));
    } finally {
      setReading(false);
    }
  };
  const onInput = (input: HTMLInputElement | null) => {
    if (input?.files) add(fromFiles(input.files));
    if (input) input.value = "";
  };

  return (
    <div className="space-y-5">
      {isApple && <Notice>{notices.INFO_IPHONE_ORIGINALS}</Notice>}

      <section
        aria-label={strings.send.dropTitle}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`rounded-3xl border-2 border-dashed p-6 transition-colors ${over ? "border-ink bg-tag/30" : "border-line bg-surface"}`}
      >
        <p className="font-display text-xl font-semibold">{strings.send.dropTitle}</p>
        <p className="mt-1 text-sm text-muted">{strings.send.dropHint}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => filesInput.current?.click()}>{strings.send.chooseFiles}</Button>
          <Button variant="secondary" onClick={() => folderInput.current?.click()}>
            {strings.send.chooseFolder}
          </Button>
        </div>
        <input
          ref={filesInput}
          type="file"
          multiple
          hidden
          onChange={(e) => onInput(e.currentTarget)}
          data-testid="pick-files"
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...{ webkitdirectory: "" }}
          onChange={(e) => onInput(e.currentTarget)}
          data-testid="pick-folder"
        />
        {reading && <p className="mt-3 text-sm text-muted">{strings.send.reading}</p>}
      </section>

      {count > 0 && (
        <section aria-label={strings.send.totals(count, formatBytes(bytes))} className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-semibold tabular-nums" role="status">
              {strings.send.totals(count, formatBytes(bytes))}
            </p>
            <Button variant="quiet" onClick={() => onChange([])}>
              {strings.send.clear}
            </Button>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {picked.slice(0, SHOWN).map((p, index) => (
              <li
                key={`${p.kind}:${p.path}:${p.file?.size ?? 0}:${p.file?.lastModified ?? 0}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  <bdi>{p.path}</bdi>
                </span>
                <span className="shrink-0 text-muted tabular-nums">
                  {p.file ? formatBytes(p.file.size) : strings.send.emptyFolder}
                </span>
                <button
                  type="button"
                  aria-label={strings.send.remove(p.path)}
                  onClick={() => onChange(picked.filter((_, i) => i !== index))}
                  className="-my-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {count > SHOWN && (
            <p className="text-sm text-muted">{strings.review.more(count - SHOWN)}</p>
          )}
        </section>
      )}

      {androidPhotos && <Notice>{notices.INFO_LOCATION_MAY_BE_HIDDEN}</Notice>}
      {tooMany && (
        <Notice tone="warn">
          {messages.LIMIT_EXCEEDED.what} {messages.LIMIT_EXCEEDED.next}
        </Notice>
      )}

      <Button size="lg" className="w-full" disabled={count === 0 || tooMany} onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}
