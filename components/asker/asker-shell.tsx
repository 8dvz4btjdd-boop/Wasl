import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { Link } from "@/i18n/navigation";

// One column, logo at the top, content free to pin a composer to the bottom.
export function AskerShell({ children }: { children: ReactNode }) {
  return (
    <Surface kind="asker" className="flex min-h-dvh flex-1 flex-col">
      <header className="mx-auto w-full max-w-xl px-6 pt-6">
        <Link href="/" className="inline-flex rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo size={28} />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-6">{children}</main>
    </Surface>
  );
}
