"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Three steps, each drawn as the matching scene of the hero animation, revealed once on scroll. */
export function HowItWorks() {
  const t = useTranslations("Home");
  const number = new Intl.NumberFormat(useLocale());
  const steps = [
    { title: t("stepAsk"), body: t("stepAskBody"), scene: <AskScene /> },
    { title: t("stepTalk"), body: t("stepTalkBody"), scene: <TalkScene /> },
    { title: t("stepResume"), body: t("stepResumeBody"), scene: <ResumeScene /> },
  ];

  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20">
      <h2 id="how-title" className="text-2xl font-semibold sm:text-3xl">
        {t("howTitle")}
      </h2>
      <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-6">
        {steps.map((step, i) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: i * 0.12 }}
            className="flex flex-col gap-5"
          >
            <div aria-hidden className="flex h-40 items-center justify-center rounded-3xl border border-white/[0.07] bg-[#0b1136] px-6">
              {step.scene}
            </div>
            <div className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-brand-teal/40 text-sm text-teal-fg tabular-nums">
                {number.format(i + 1)}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-1.5 rounded-full", className)} />;
}

function AskScene() {
  return (
    <div className="flex w-full max-w-52 flex-col items-end gap-2">
      <div className="flex w-40 flex-col gap-1.5 rounded-2xl rounded-ee-md bg-brand-violet px-3.5 py-3">
        <Bar className="w-full bg-white/80" />
        <Bar className="w-2/3 bg-white/60" />
      </div>
      <span className="h-8 w-full rounded-full border border-white/10" />
    </div>
  );
}

function TalkScene() {
  return (
    <div className="flex w-full max-w-52 flex-col gap-2.5">
      <div className="flex w-32 flex-col gap-1.5 self-end rounded-2xl rounded-ee-md bg-brand-violet px-3.5 py-2.5">
        <Bar className="w-full bg-white/80" />
      </div>
      <div className="flex items-end gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-brand-teal/20 text-brand-teal">
          <span className="size-2 rounded-full bg-current" />
        </span>
        <div className="flex w-36 flex-col gap-1.5 rounded-2xl rounded-es-md bg-white/[0.08] px-3.5 py-2.5">
          <Bar className="w-full bg-white/50" />
          <Bar className="w-1/2 bg-white/35" />
        </div>
      </div>
    </div>
  );
}

function ResumeScene() {
  return (
    <div className="relative w-full max-w-52">
      <div className="flex flex-col gap-2.5 rounded-2xl border border-brand-teal/40 bg-[#141c4f] p-3.5">
        <span className="flex items-center gap-1.5">
          <Logo size={14} />
          <Bar className="w-14 bg-white/60" />
        </span>
        {["w-full", "w-4/5", "w-3/5"].map((w) => (
          <span key={w} className="flex flex-col gap-1">
            <Bar className="h-1 w-10 bg-white/25" />
            <Bar className={cn(w, "bg-white/55")} />
          </span>
        ))}
      </div>
      <span className="absolute -end-3 -top-3 flex">
        <span className="size-7 rounded-full bg-brand-teal/20 opacity-50 ring-2 ring-[#0b1136]" />
        <span className="-ms-2.5 size-7 rounded-full bg-brand-violet ring-2 ring-[#0b1136]" />
      </span>
    </div>
  );
}
