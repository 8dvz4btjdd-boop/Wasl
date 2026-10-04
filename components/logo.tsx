import { useId } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Same artwork as public/brand/wasl-logo.svg, inlined so it can be sized and
// labelled per locale. IDs are per instance so several logos can share a page.
export const VIEW_BOX = { x: 66, y: 28, width: 486, height: 418 };
export const BACK_BUBBLE =
  "M124 143H386A46 46 0 0 1 432 189V339A46 46 0 0 1 386 385H230L163 436V385H124A46 46 0 0 1 78 339V189A46 46 0 0 1 124 143Z";
export const FRONT_BUBBLE =
  "M235 48H480A52 52 0 0 1 532 100V240A52 52 0 0 1 480 292H446V336L398 292H235A52 52 0 0 1 183 240V100A52 52 0 0 1 235 48Z";

type LogoProps = {
  /** Height of the mark in px. The wordmark scales with it. */
  size?: number;
  /** Show the localized name (وصل / Wasl) after the mark. */
  wordmark?: boolean;
  className?: string;
};

export function Logo({ size = 32, wordmark = false, className }: LogoProps) {
  const t = useTranslations("Brand");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `wasl-overlap-${uid}`;
  const clipId = `wasl-clip-${uid}`;
  const name = t("name");
  const width = Math.round((size * VIEW_BOX.width) / VIEW_BOX.height);

  return (
    <span
      className={cn("inline-flex items-center gap-[0.3em] text-foreground", className)}
      style={{ fontSize: size * 0.72 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        width={width}
        height={size}
        fill="none"
        className="shrink-0"
        {...(wordmark ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="180"
            y1="145"
            x2="430"
            y2="300"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#3EE8C6" />
            <stop offset="1" stopColor="#5A7FE6" />
          </linearGradient>
          <clipPath id={clipId}>
            <path d={FRONT_BUBBLE} />
          </clipPath>
        </defs>
        <path d={BACK_BUBBLE} fill="#6150EA" />
        <path d={BACK_BUBBLE} fill={`url(#${gradientId})`} clipPath={`url(#${clipId})`} />
        <path d={FRONT_BUBBLE} stroke="#2EF2C4" strokeWidth="16" strokeLinejoin="round" />
      </svg>
      {wordmark && <span className="font-semibold leading-none">{name}</span>}
    </span>
  );
}
