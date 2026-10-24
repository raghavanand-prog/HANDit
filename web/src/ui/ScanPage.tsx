// Scan a code with this device's camera: for two laptops, or a phone that prefers the page
// to its camera app. The video never leaves the page; only the decoded link is used.

import { frameLoop, type QRCamera, QRCanvas, selfieCamera } from "qr/dom.js";
import { useEffect, useRef, useState } from "react";
import type { LinkResult } from "../core/link";
import { linkFromScan } from "../core/scan";
import { strings } from "../strings";
import { Button, Spinner, Title } from "./parts";
import { navigate } from "./router";

type Status = "starting" | "scanning" | "denied" | "none" | "failed";

export function ScanPage({ onLink }: { onLink: (result: LinkResult) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<QRCamera | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [stray, setStray] = useState(false);
  const strayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: opens the camera once per visit
  useEffect(() => {
    let stopped = false;
    let cancelLoop: (() => void) | undefined;
    (async () => {
      const player = video.current;
      if (!player) return;
      try {
        const opened = await selfieCamera(player);
        if (stopped) return opened.stop();
        camera.current = opened;
        setStatus("scanning");
        setDevices(await opened.listDevices().catch(() => []));
        const canvas = new QRCanvas({}, { cropToSquare: false });
        let busy = false;
        cancelLoop = frameLoop(async () => {
          if (busy || stopped) return;
          busy = true;
          try {
            const text = await opened.readFrame(canvas);
            if (typeof text !== "string" || stopped) return;
            const result = linkFromScan(text, location.origin);
            if (!result) {
              setStray(true);
              clearTimeout(strayTimer.current);
              strayTimer.current = setTimeout(() => setStray(false), 2500);
              return;
            }
            stopped = true;
            cancelLoop?.();
            opened.stop();
            onLink(result);
          } finally {
            busy = false;
          }
        });
      } catch (error) {
        const name = (error as { name?: string }).name;
        setStatus(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "none"
              : "failed",
        );
      }
    })();
    return () => {
      stopped = true;
      cancelLoop?.();
      camera.current?.stop();
      clearTimeout(strayTimer.current);
    };
  }, []);

  const failed = status === "denied" || status === "none" || status === "failed";
  return (
    <div className="space-y-6">
      <Title>{strings.scan.title}</Title>
      <p className="text-muted">{strings.scan.hint}</p>
      <div className="relative overflow-hidden rounded-3xl bg-black">
        <video
          ref={video}
          muted
          playsInline
          aria-label={strings.scan.preview}
          className="aspect-[4/3] w-full object-cover"
        />
        {status === "scanning" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[12%] rounded-3xl border-4 border-tag/90"
          />
        )}
        {status === "starting" && (
          <p
            className="absolute inset-0 flex items-center justify-center gap-3 text-white"
            role="status"
          >
            <Spinner /> {strings.scan.starting}
          </p>
        )}
      </div>
      {failed && (
        <p role="alert" className="rounded-xl border-l-4 border-danger bg-surface px-4 py-3">
          {status === "denied"
            ? strings.scan.denied
            : status === "none"
              ? strings.scan.none
              : strings.scan.failed}
        </p>
      )}
      <p role="status" className="min-h-6 text-sm text-warn">
        {stray ? strings.scan.stray : ""}
      </p>
      <div className="flex flex-wrap gap-3">
        {devices.length > 1 && (
          <Button
            variant="secondary"
            onClick={() => {
              const next = (deviceIndex + 1) % devices.length;
              setDeviceIndex(next);
              const device = devices[next];
              if (device) void camera.current?.setDevice(device.deviceId);
            }}
          >
            {strings.scan.switchCamera}
          </Button>
        )}
        <Button variant="quiet" onClick={() => navigate("/")}>
          {strings.cancel}
        </Button>
      </div>
    </div>
  );
}
