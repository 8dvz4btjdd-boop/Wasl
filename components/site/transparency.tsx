import { Check, Minus, Power } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** What the AI guide does and never does, in the asker's words. */
export async function Transparency() {
  const t = await getTranslations("Home");
  const does = [t("aiDoes1"), t("aiDoes2"), t("aiDoes3")];
  const never = [t("aiNever1"), t("aiNever2"), t("aiNever3")];

  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-20">
      <h2 id="ai-title" className="max-w-2xl text-2xl font-semibold text-balance sm:text-3xl">
        {t("aiTitle")}
      </h2>
      <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-2">
        <List title={t("aiDoes")} items={does} kind="does" />
        <List title={t("aiNever")} items={never} kind="never" />
      </div>
      <p className="mt-6 flex items-center gap-3 text-[0.9375rem] text-muted-foreground">
        <Power className="size-4 shrink-0 text-teal-fg" aria-hidden />
        {t("aiManual")}
      </p>
    </section>
  );
}

function List({ title, items, kind }: { title: string; items: string[]; kind: "does" | "never" }) {
  const Icon = kind === "does" ? Check : Minus;
  return (
    <div className="flex flex-col gap-5 bg-background p-6 sm:p-8">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[0.9375rem] leading-relaxed">
            <span
              className={
                kind === "does"
                  ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-teal-fg"
                  : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.08] text-muted-foreground"
              }
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
