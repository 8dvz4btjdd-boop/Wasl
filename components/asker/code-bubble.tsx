// The logo's front bubble (teal outline, rounded body, tail at the bottom end),
// stretched wide to hold the return code. Geometry follows public/brand/wasl-logo.svg.
const W = 600;
const BODY = 176;
const R = 44;
const S = 8; // half the stroke width
const TAIL_X = W - S - R - 30;
const TAIL_DEPTH = 40;
const TAIL_WIDTH = 48;
const H = BODY + TAIL_DEPTH + S;

const PATH = [
  `M${S + R} ${S}`,
  `H${W - S - R}`,
  `A${R} ${R} 0 0 1 ${W - S} ${S + R}`,
  `V${BODY - R}`,
  `A${R} ${R} 0 0 1 ${W - S - R} ${BODY}`,
  `H${TAIL_X}`,
  `V${BODY + TAIL_DEPTH}`,
  `L${TAIL_X - TAIL_WIDTH} ${BODY}`,
  `H${S + R}`,
  `A${R} ${R} 0 0 1 ${S} ${BODY - R}`,
  `V${S + R}`,
  `A${R} ${R} 0 0 1 ${S + R} ${S}`,
  "Z",
].join(" ");

export function CodeBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 size-full rtl:-scale-x-100"
        fill="none"
        aria-hidden
      >
        <path d={PATH} stroke="var(--color-brand-teal)" strokeWidth={S * 2} strokeLinejoin="round" />
      </svg>
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ height: `${(BODY / H) * 100}%` }}
      >
        {children}
      </div>
    </div>
  );
}
