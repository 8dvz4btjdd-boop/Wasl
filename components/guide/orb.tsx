"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type OrbState = "listening" | "thinking" | "speaking" | "done";

/**
 * The guide's presence: a sphere from teal into violet. It breathes while listening, turns
 * slowly while thinking, sends out ripples while speaking, and settles when done. With
 * reduced motion it stays still in every state.
 */
export function Orb({ state, size = 120, className }: { state: OrbState; size?: number; className?: string }) {
  const reduced = useReducedMotion();
  const still = reduced || state === "done";
  return (
    <div aria-hidden data-state={state} className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size * 1.7, height: size * 1.7 }}>
      {state === "speaking" &&
        !reduced &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full border border-brand-teal/50"
            style={{ width: size, height: size }}
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity, delay: i * 0.6 }}
          />
        ))}
      <motion.span
        className="absolute rounded-full blur-2xl"
        style={{ width: size * 1.1, height: size * 1.1, background: "radial-gradient(circle, rgba(46,242,196,0.35), rgba(97,80,234,0.15) 60%, transparent 70%)" }}
        animate={still ? { opacity: 0.5 } : { opacity: [0.45, 0.8, 0.45] }}
        transition={still ? { duration: 0.2 } : { duration: 2.4, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.span
        className="relative rounded-full shadow-[inset_0_-10px_30px_rgba(14,21,63,0.45),inset_0_8px_24px_rgba(255,255,255,0.25)]"
        style={{
          width: size,
          height: size,
          background: "radial-gradient(circle at 32% 28%, #b8fff0 0%, #2ef2c4 22%, #3ee8c6 38%, #5a7fe6 68%, #6150ea 100%)",
        }}
        animate={
          still
            ? { scale: 1, rotate: 0 }
            : state === "listening"
              ? { scale: [1, 1.05, 1] }
              : state === "thinking"
                ? { rotate: 360 }
                : { scale: [1, 1.03, 1] }
        }
        transition={
          still
            ? { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            : state === "thinking"
              ? { duration: 6, ease: "linear", repeat: Infinity }
              : { duration: state === "listening" ? 2.4 : 1.2, ease: "easeInOut", repeat: Infinity }
        }
      />
    </div>
  );
}
