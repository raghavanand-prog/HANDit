// The code, drawn as an SVG from the QR matrix (no images, nothing a strict
// Content Security Policy would block). Always dark on white, which every camera reads.
import { useMemo } from "react";
import { qrMatrix } from "../core/scan";
import { strings } from "../strings";

export function QrCode({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(text);
    let d = "";
    matrix.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { size: matrix.length, path: d };
  }, [text]);

  return (
    <svg
      role="img"
      aria-label={strings.code.qrLabel}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="block h-auto w-full"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#101522" />
    </svg>
  );
}
