"use client";

import { useTranslations } from "next-intl";
import { CARD_FIELDS, isUndefinedField, type CardField } from "@/lib/cards/types";
import { cn } from "@/lib/utils";

type CardViewProps = {
  fields: Record<CardField, string | null>;
  size?: "asker" | "compact";
  className?: string;
};

/** The four card fields exactly as a daee sees them; empty fields read "غير محدد". */
export function CardView({ fields, size = "asker", className }: CardViewProps) {
  const t = useTranslations("Card");
  const compact = size === "compact";
  return (
    <dl className={cn("flex flex-col", compact ? "gap-3" : "gap-5", className)}>
      {CARD_FIELDS.map((field) => {
        const value = fields[field];
        const empty = isUndefinedField(value);
        return (
          <div key={field} className="flex flex-col gap-1">
            <dt className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-sm")}>{t(field)}</dt>
            <dd dir={empty ? undefined : "auto"} className={cn("whitespace-pre-wrap", compact ? "text-sm" : "text-base", empty && "text-muted-foreground")}>
              {empty ? t("undefined") : value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
