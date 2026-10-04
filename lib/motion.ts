import type { Variants } from "motion/react";

// Motion presets. Every animation is under 300 ms, ease-out, and only used for
// state changes. Reduced motion is handled by <MotionProvider> (transforms are
// dropped, opacity is kept). CSS equivalents: animate-fade-up,
// animate-sheet-in, animate-pulse-once in app/globals.css.

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.16,
  base: 0.22,
  slow: 0.28,
} as const;

/** Content entering: fades in while rising 8px. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Bottom sheet (the card). Slides up from below; direction-neutral in RTL. */
export const sheetIn: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
  exit: { y: "100%", transition: { duration: DURATION.base, ease: EASE_OUT } },
};

/** One-shot pulse on a state change (e.g. the guide orb when it starts listening). */
export const pulse: Variants = {
  idle: { scale: 1 },
  pulse: { scale: [1, 1.06, 1], transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

/** Parent variant so children (card fields) animate in one by one. */
export function staggerChildren(step = 0.06): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren: step } } };
}
