import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { Surface } from "@/components/surface";
import { getOrgName } from "@/lib/db/queries/org";

// One column under the compact site header; content is free to pin a composer to the
// bottom. No footer on the asker flow. back: a back control at the start of the header.
export async function AskerShell({ children, back = false }: { children: ReactNode; back?: boolean }) {
  const orgName = await getOrgName();
  return (
    <Surface kind="asker" className="flex min-h-dvh flex-1 flex-col">
      <SiteHeader orgName={orgName} variant="compact" back={back} />
      <main id="content" className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-6">
        {children}
      </main>
    </Surface>
  );
}
