"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { BACK_BUBBLE, FRONT_BUBBLE, VIEW_BOX } from "@/components/logo";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * The logo's two bubbles drift in from opposite corners and meet once, then the overlap
 * fills in: the product in one gesture, two people connecting. Each step is under 300ms;
 * with reduced motion only the fades remain (MotionConfig drops transforms).
 */
export function ConnectingBubbles({ size = 220 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `cb-overlap-${uid}`;
  const clipId = `cb-clip-${uid}`;
  const width = Math.round((size * VIEW_BOX.width) / VIEW_BOX.height);
  const enter = { duration: DURATION.slow, ease: EASE_OUT };

  return (
    <svg
      viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      width={width}
      height={size}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="180" y1="145" x2="430" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3EE8C6" />
          <stop offset="1" stopColor="#5A7FE6" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={FRONT_BUBBLE} />
        </clipPath>
      </defs>
      <motion.path
        d={BACK_BUBBLE}
        fill="#6150EA"
        initial={{ x: -36, y: 36, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={enter}
      />
      <motion.path
        d={BACK_BUBBLE}
        fill={`url(#${gradientId})`}
        clipPath={`url(#${clipId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.base, ease: EASE_OUT, delay: DURATION.slow }}
      />
      <motion.path
        d={FRONT_BUBBLE}
        stroke="#2EF2C4"
        strokeWidth="16"
        strokeLinejoin="round"
        initial={{ x: 36, y: -36, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={enter}
      />
    </svg>
  );
}
