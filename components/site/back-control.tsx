"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

// A page with steps (the enter flow) registers a handler that steps back and returns true;
// at the first step it returns false and the control leaves for the landing page.
let backHandler: (() => boolean) | null = null;

export function useBackHandler(handler: () => boolean) {
  useEffect(() => {
    backHandler = handler;
    return () => {
      if (backHandler === handler) backHandler = null;
    };
  }, [handler]);
}

/** Small back control at the start of the header. A real link, so it works before hydration. */
export function BackControl() {
  const t = useTranslations("Site");
  return (
    <Link
      href="/"
      aria-label={t("back")}
      title={t("back")}
      onClick={(event) => {
        if (backHandler?.()) event.preventDefault();
      }}
      className="-ms-2 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}
