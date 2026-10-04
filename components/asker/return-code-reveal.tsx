"use client";

import { Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CodeBubble } from "@/components/asker/code-bubble";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { fadeUp, pulse } from "@/lib/motion";

type ReturnCodeRevealProps = { code: string; pseudonym: string };

export function ReturnCodeReveal({ code, pseudonym }: ReturnCodeRevealProps) {
  const t = useTranslations("Enter");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code stays on screen to copy by hand.
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-10 py-10">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">{t("codeTitle")}</h1>
        <p className="text-lg text-muted-foreground">{t("codeFor", { pseudonym })}</p>
      </motion.div>

      <motion.div variants={pulse} initial="idle" animate="pulse">
        <CodeBubble>
          <p
            dir="ltr"
            className="font-semibold tracking-[0.08em] tabular-nums text-[8.5cqw] leading-none select-all"
          >
            {code}
          </p>
        </CodeBubble>
      </motion.div>

      <p className="max-w-prose text-lg text-muted-foreground">{t("codeBody")}</p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" size="lg" className="h-12 px-5 text-base" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </Button>
        <Link href="/wait" className={cn(buttonVariants({ size: "lg" }), "h-12 px-5 text-base")}>
          {t("saved")}
        </Link>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}
