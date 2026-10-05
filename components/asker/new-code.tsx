"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CodeBubble } from "@/components/asker/code-bubble";
import { Button } from "@/components/ui/button";
import { issueNewReturnCode } from "@/lib/auth/new-code";
import { fadeUp } from "@/lib/motion";

/**
 * "Show a new return code" at the end of a conversation. The new code replaces the old one
 * (which stops working) and is shown once, here, with copy.
 */
export function NewReturnCode() {
  const t = useTranslations("Chat");
  const tEnter = useTranslations("Enter");
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code stays on screen to copy by hand.
    }
  }

  if (code) {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-3 border-t pt-4">
        <p className="font-medium">{t("newCodeTitle")}</p>
        <CodeBubble>
          <p dir="ltr" className="font-semibold tracking-[0.08em] tabular-nums text-[7cqw] leading-none select-all">
            {code}
          </p>
        </CodeBubble>
        <p className="text-sm text-muted-foreground">{t("newCodeBody")}</p>
        <Button type="button" variant="outline" size="lg" className="self-start" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? tEnter("copied") : tEnter("copy")}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? tEnter("copied") : ""}
        </span>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false} mode="wait">
        {confirming ? (
          <motion.div key="confirm" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="flex flex-col gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">{failed ? t("newCodeFailed") : t("newCodeWarning")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await issueNewReturnCode();
                    if (res.ok) setCode(res.code);
                    else setFailed(true);
                  })
                }
              >
                {t("newCodeConfirm")}
              </Button>
              <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                {tEnter("back")}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ask" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            <Button variant="ghost" size="sm" className="-ms-2 text-muted-foreground" onClick={() => setConfirming(true)}>
              <KeyRound aria-hidden />
              {t("newCode")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("newCodeHint")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
