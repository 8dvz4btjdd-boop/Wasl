"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The product in one loop (about 6s): an asker and a dāʿī talk, the chat pauses, the two
 * messages the asker picks light up and a Wasl card assembles from them field by field,
 * then a second dāʿī joins, the card folds into her context and the chat continues.
 * Every transition is under 300ms. Off screen or with reduced motion it doesn't run:
 * reduced motion shows one still frame with the card assembled.
 */

// Scene start times (ms) within one loop.
const TIMELINE = [
  { at: 200, scene: 1 }, // asker asks
  { at: 900, scene: 2 }, // first dāʿī replies
  { at: 1700, scene: 3 }, // pause: the asker selects both messages
  { at: 2100, scene: 4 }, // the card assembles, field by field
  { at: 3700, scene: 5 }, // second dāʿī picks it up
  { at: 4400, scene: 6 }, // and the chat continues
  { at: 5900, scene: 7 }, // fade out
] as const;
const LOOP_MS = 6200;

const enter = { duration: DURATION.base, ease: EASE_OUT };

export function HeroAnimation({ className }: { className?: string }) {
  const t = useTranslations("Demo");
  const tHome = useTranslations("Home");
  const tCard = useTranslations("Card");
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [scene, setScene] = useState(0);
  const running = inView && !reduced;

  useEffect(() => {
    if (!running) return;
    let timers: number[] = [];
    const loop = () => {
      setScene(0);
      timers = TIMELINE.map(({ at, scene: s }) => window.setTimeout(() => setScene(s), at));
      timers.push(window.setTimeout(loop, LOOP_MS));
    };
    loop();
    return () => timers.forEach(clearTimeout);
  }, [running]);

  // Still frame: the card assembled from the two highlighted messages, the second dāʿī joined.
  const s = reduced ? 4.5 : scene;
  const out = s === 7;
  const show = {
    ask: s >= 1 && !out,
    reply: s >= 2 && !out,
    selected: s >= 3 && s < 5,
    card: !out && s >= 4 ? (s >= 5 && s !== 4.5 ? "compact" : "full") : null,
    sara: !out && s >= 4.5,
    reply2: s >= 6 && !out,
  };

  const fields = [
    { label: tCard("follow_up"), value: t("followUp") },
    { label: tCard("covered"), value: t("covered") },
    { label: tCard("next_step"), value: t("next") },
  ];

  return (
    <div
      ref={ref}
      role="img"
      data-hero-animation
      aria-label={tHome("animationLabel")}
      className={cn(
        "relative mx-auto flex h-[27rem] w-full max-w-[24rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b1136] shadow-[0_30px_80px_-30px_rgba(46,242,196,0.25)]",
        className,
      )}
    >
      <div aria-hidden className="contents">
        {/* Participants: the first dāʿī, then the second joins and the first steps back. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4">
          <Avatar letter={t("daee1")} tone="teal" dim={show.sara} />
          <AnimatePresence>
            {show.sara && (
              <motion.span
                key="sara"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
                transition={enter}
                className="-ms-3"
              >
                <Avatar letter={t("daee2")} tone="violet" ring />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="ms-1 truncate text-sm font-medium text-white/85">{show.sara ? t("daee2") : t("daee1")}</span>
          <span className="ms-auto size-2 rounded-full bg-brand-teal" />
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col gap-2.5 px-4 pt-4">
          <AnimatePresence>
            {show.ask && (
              <Bubble key="ask" side="asker" selected={show.selected} faded={show.sara && !show.selected}>
                {t("ask")}
              </Bubble>
            )}
            {show.reply && (
              <Bubble key="reply" side="daee" selected={show.selected} faded={show.sara && !show.selected}>
                {t("reply")}
              </Bubble>
            )}
            {show.reply2 && (
              <motion.p
                key="continues"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={enter}
                className="py-0.5 text-center text-xs text-white/50"
              >
                {t("continues", { name: t("daee2") })}
              </motion.p>
            )}
            {show.reply2 && (
              <Bubble key="reply2" side="daee" tone="violet">
                {t("reply2")}
              </Bubble>
            )}
          </AnimatePresence>
        </div>

        {/* The Wasl card: a bottom sheet while it assembles, then a compact chip in the new dāʿī's context. */}
        <AnimatePresence>
          {show.card && (
            <motion.div
              key="card"
              layout
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20, transition: { duration: DURATION.fast } }}
              transition={{ ...enter, layout: { duration: DURATION.slow, ease: EASE_OUT } }}
              className={cn(
                "absolute inset-x-3 bottom-3 overflow-hidden border bg-[#141c4f]",
                show.card === "full" ? "rounded-2xl border-brand-teal/35 p-4" : "rounded-xl border-brand-teal/60 px-3 py-2.5",
              )}
            >
              <motion.div layout="position" className="flex items-center gap-2">
                <Logo size={16} />
                <span className="text-xs font-semibold text-white">{tCard("title")}</span>
                {show.card === "compact" && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={enter} className="ms-auto">
                    <Avatar letter={t("daee2")} tone="violet" size="sm" />
                  </motion.span>
                )}
              </motion.div>
              {show.card === "full" && (
                <dl className="mt-3 flex flex-col gap-2.5">
                  {fields.map((f, i) => (
                    <motion.div
                      key={f.label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...enter, delay: reduced ? 0 : 0.25 + i * 0.3 }}
                      className="flex flex-col gap-0.5"
                    >
                      <dt className="text-[0.6875rem] text-white/50">{f.label}</dt>
                      <dd className="text-[0.8125rem] leading-snug text-white">{f.value}</dd>
                    </motion.div>
                  ))}
                  {show.sara && (
                    <div className="mt-1 flex items-center gap-2 border-t border-white/[0.07] pt-2.5 text-xs text-white/60">
                      <Avatar letter={t("daee2")} tone="violet" size="sm" />
                      {t("continues", { name: t("daee2") })}
                    </div>
                  )}
                </dl>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Bubble({
  side,
  tone = "teal",
  selected = false,
  faded = false,
  children,
}: {
  side: "asker" | "daee";
  tone?: "teal" | "violet";
  selected?: boolean;
  faded?: boolean;
  children: string;
}) {
  const asker = side === "asker";
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: faded ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
      transition={enter}
      className={cn("flex max-w-[85%]", asker ? "self-end" : "self-start")}
    >
      <p
        className={cn(
          "rounded-2xl px-3.5 py-2 text-[0.8125rem] leading-snug transition-shadow duration-200",
          asker ? "rounded-ee-md bg-brand-violet text-white" : "rounded-es-md bg-white/[0.08] text-white/90",
          !asker && tone === "violet" && "bg-brand-violet/25",
          selected && "shadow-[0_0_0_2px_#0b1136,0_0_0_4px_var(--color-brand-teal)]",
        )}
      >
        {children}
      </p>
    </motion.div>
  );
}

function Avatar({
  letter,
  tone,
  size = "md",
  dim = false,
  ring = false,
}: {
  letter: string;
  tone: "teal" | "violet";
  size?: "sm" | "md";
  dim?: boolean;
  ring?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold transition-opacity duration-200",
        size === "md" ? "size-8 text-sm" : "size-5 text-[0.625rem]",
        tone === "teal" ? "bg-brand-teal/20 text-brand-teal" : "bg-brand-violet text-white",
        ring && "ring-2 ring-[#0b1136]",
        dim && "opacity-40",
      )}
    >
      {Array.from(letter)[0]}
    </span>
  );
}
