// The home page's picture: a laptop handing files straight to a phone. Files travel along one
// path, a lock marks that nothing is read on the way, and a check lands on the phone. It loops
// calmly; with reduced motion it is a still picture of the same moment.
import { useId } from "react";
import { strings } from "../strings";
import { useReducedMotion } from "./motion";

const PATH = "M118 178 C 190 70, 290 70, 362 178";
const CYCLE = 4.8;

/** A file chip that rides the path, one per file type. */
function Chip({
  label,
  offset,
  still,
}: {
  label: string;
  offset: number;
  still?: { x: number; y: number };
}) {
  const body = (
    <g>
      <rect
        x="-19"
        y="-14"
        width="38"
        height="28"
        rx="8"
        className="fill-surface stroke-accent"
        strokeWidth="2"
      />
      <text y="4.5" textAnchor="middle" className="fill-ink" fontSize="11" fontWeight="700">
        {label}
      </text>
    </g>
  );
  if (still) return <g transform={`translate(${still.x} ${still.y})`}>{body}</g>;
  return (
    <g opacity="0">
      {body}
      <animateMotion
        dur={`${CYCLE}s`}
        begin={`${offset}s`}
        repeatCount="indefinite"
        path={PATH}
        keyPoints="0;1"
        keyTimes="0;1"
        calcMode="spline"
        keySplines="0.45 0 0.55 1"
      />
      <animate
        attributeName="opacity"
        dur={`${CYCLE}s`}
        begin={`${offset}s`}
        repeatCount="indefinite"
        values="0;1;1;1;0"
        keyTimes="0;0.1;0.5;0.88;1"
      />
    </g>
  );
}

export function HandoffScene() {
  const reduced = useReducedMotion();
  const gradient = useId();
  return (
    <svg
      role="img"
      aria-label={strings.home.sceneLabel}
      viewBox="0 0 480 330"
      className="mx-auto h-auto w-full max-w-lg"
    >
      <defs>
        <linearGradient id={gradient} x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.15" />
          <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* the straight path between the two devices */}
      <path
        d={PATH}
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 9"
      />

      {/* laptop */}
      <g>
        <rect
          x="26"
          y="150"
          width="124"
          height="82"
          rx="10"
          className="fill-surface stroke-ink"
          strokeWidth="3"
        />
        <rect x="36" y="160" width="104" height="62" rx="5" className="fill-accent-soft" />
        {/* a QR code on its screen */}
        <g className="fill-ink">
          {[0, 1, 2, 3, 4].flatMap((r) =>
            [0, 1, 2, 3, 4].map((c) =>
              (r * 7 + c * 3 + r * c) % 3 !== 0 || (r < 2 && c < 2) ? (
                <rect
                  key={`${r}-${c}`}
                  x={64 + c * 9}
                  y={165 + r * 9}
                  width="7"
                  height="7"
                  rx="1.5"
                />
              ) : null,
            ),
          )}
        </g>
        <path d="M10 238 h156 a8 8 0 0 1 -8 12 h-140 a8 8 0 0 1 -8 -12z" className="fill-ink" />
      </g>

      {/* phone */}
      <g>
        <rect
          x="338"
          y="104"
          width="84"
          height="148"
          rx="16"
          className="fill-surface stroke-ink"
          strokeWidth="3"
        />
        <rect x="346" y="118" width="68" height="120" rx="8" className="fill-accent-soft" />
        <rect x="368" y="110" width="24" height="4" rx="2" className="fill-ink" />
        <g>
          <circle
            cx="380"
            cy="178"
            r="17"
            className="fill-verified-soft stroke-verified"
            strokeWidth="3"
          />
          <path
            d="M371 178l7 7 12-14"
            fill="none"
            className="stroke-verified"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!reduced && (
            <animate
              attributeName="opacity"
              dur={`${CYCLE}s`}
              repeatCount="indefinite"
              values="0.35;0.35;1;1;0.35"
              keyTimes="0;0.7;0.78;0.95;1"
            />
          )}
        </g>
      </g>

      {/* the lock: nothing in the middle can read or change the files */}
      <g transform="translate(240 92)">
        {!reduced && (
          <circle r="22" fill="none" className="stroke-tag" strokeWidth="3">
            <animate
              attributeName="r"
              dur={`${CYCLE}s`}
              repeatCount="indefinite"
              values="18;34;34"
              keyTimes="0;0.55;1"
            />
            <animate
              attributeName="opacity"
              dur={`${CYCLE}s`}
              repeatCount="indefinite"
              values="0.9;0;0"
              keyTimes="0;0.55;1"
            />
          </circle>
        )}
        <circle r="20" className="fill-tag" />
        <path
          d="M-6 -2 v-4 a6 6 0 0 1 12 0 v4 M-9 -2 h18 v13 h-18z"
          className="fill-tag-ink stroke-tag-ink"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </g>

      {reduced ? (
        <>
          <Chip label="JPG" offset={0} still={{ x: 170, y: 102 }} />
          <Chip label="MOV" offset={0} still={{ x: 240, y: 148 }} />
          <Chip label="PDF" offset={0} still={{ x: 312, y: 112 }} />
        </>
      ) : (
        <>
          <Chip label="JPG" offset={0} />
          <Chip label="MOV" offset={1.6} />
          <Chip label="PDF" offset={3.2} />
        </>
      )}
    </svg>
  );
}
