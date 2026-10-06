"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { CodeBubble } from "@/components/asker/code-bubble";
import { Button } from "@/components/ui/button";
import { issueNewReturnCode } from "@/lib/auth/new-code";
import { fadeUp } from "@/lib/motion";

/** A revealed code with copy. Shown once; the next reveal issues a new one. */
function CodeDisplay({ code, replacedShown }: { code: string; replacedShown: boolean }) {
  const t = useTranslations("Chat");
  const tEnter = useTranslations("Enter");
  const [copied, setCopied] = useState(false);
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" data-testid="return-code" className="flex flex-col gap-3">
      <CodeBubble>
        <p dir="ltr" data-testid="return-code-value" className="font-semibold tracking-[0.08em] tabular-nums text-[7cqw] leading-none select-all">
          {code}
        </p>
      </CodeBubble>
      {replacedShown && <p className="text-sm text-muted-foreground">{t("newCodeHint")}</p>}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="self-start"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            // Clipboard blocked: the code stays on screen to copy by hand.
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? tEnter("copied") : tEnter("copy")}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? tEnter("copied") : ""}
      </span>
    </motion.div>
  );
}

/**
 * "Return code" in the chat header, any time. Each reveal issues a new code and the previous
 * one stops; once a code has been shown before, the asker is told so first.
 */
export function ReturnCodeButton({ codesRevealed }: { codesRevealed: number }) {
  const t = useTranslations("Chat");
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(codesRevealed);
  const [result, setResult] = useState<{ code: string; replacedShown: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const reveal = () =>
    startTransition(async () => {
      const res = await issueNewReturnCode();
      if (!res.ok) return setFailed(true);
      setResult({ code: res.code, replacedShown: res.replacedShown });
      setRevealed((n) => n + 1);
    });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setResult(null);
          setFailed(false);
          // The first reveal needs no warning: no code was ever shown.
          if (revealed === 0) reveal();
        }
      }}
    >
      <Dialog.Trigger
        data-testid="code-button"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <KeyRound className="size-4" aria-hidden />
        {t("codeButton")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup data-surface="asker" data-theme="dark" className="fixed inset-x-4 top-[15vh] z-50 mx-auto flex max-w-md flex-col gap-4 rounded-3xl border bg-card p-6 text-foreground outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">{t("codeButton")}</Dialog.Title>
            <Dialog.Close aria-label={t("close")} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          {result ? (
            <CodeDisplay code={result.code} replacedShown={result.replacedShown} />
          ) : revealed > 0 && !pending ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{failed ? t("newCodeFailed") : t("newCodeHint")}</p>
              <Button size="lg" className="self-start" onClick={reveal}>
                {t("newCode")}
              </Button>
            </div>
          ) : (
            <span className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * When a conversation ends the asker gets a code automatically, with copy, to save before
 * signing out. It is a new code; from the second reveal on the asker is told the previous
 * one stops.
 */
export function EndedCode() {
  const t = useTranslations("Chat");
  const [result, setResult] = useState<{ code: string; replacedShown: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const issued = useRef(false);

  useEffect(() => {
    if (issued.current) return;
    issued.current = true;
    void issueNewReturnCode().then((res) => (res.ok ? setResult({ code: res.code, replacedShown: res.replacedShown }) : setFailed(true)));
  }, []);

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <p className="font-medium">{t("saveCodeFirst")}</p>
      {result ? <CodeDisplay code={result.code} replacedShown={result.replacedShown} /> : failed ? <p className="text-sm text-muted-foreground">{t("newCodeFailed")}</p> : <span className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />}
    </div>
  );
}
