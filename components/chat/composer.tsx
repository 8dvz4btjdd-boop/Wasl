"use client";

import { ArrowUp } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ComposerProps = {
  onSend: (text: string) => void;
  placeholder: string;
  sendLabel: string;
  maxLength: number;
  disabled?: boolean;
  /** asker: large touch targets; compact: workspace density. */
  size?: "asker" | "compact";
  autoFocus?: boolean;
  onEscape?: () => void;
};

export type ComposerHandle = { focus: () => void };

/** Enter sends, Shift+Enter adds a line, IME composition (e.g. Arabic input) never sends. */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, placeholder, sendLabel, maxLength, disabled, size = "asker", autoFocus, onEscape },
  ref,
) {
  const [text, setText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }));

  const canSend = !disabled && text.trim().length > 0;

  function send() {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
    }
  }

  const asker = size === "asker";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex items-end gap-2"
    >
      <textarea
        ref={textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={maxLength}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn(
          "field-sizing-content w-full min-w-0 resize-none border border-input bg-transparent outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
          asker ? "max-h-48 min-h-14 rounded-2xl px-5 py-4 text-lg" : "max-h-40 min-h-10 rounded-lg px-3 py-2 text-sm",
        )}
      />
      <Button
        type="submit"
        disabled={!canSend}
        aria-label={sendLabel}
        className={cn("shrink-0", asker ? "size-14 rounded-2xl" : "size-10 rounded-lg")}
      >
        <ArrowUp className={asker ? "size-6" : "size-4"} aria-hidden />
      </Button>
    </form>
  );
});
