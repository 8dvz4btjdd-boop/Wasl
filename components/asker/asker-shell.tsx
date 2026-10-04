import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Surface } from "@/components/surface";
import { getOrgName } from "@/lib/db/queries/org";

// One column under the compact site header; content is free to pin a composer to the bottom.
// footer: the site footer below (entry pages); off where a composer owns the bottom edge.
export async function AskerShell({ children, footer = false }: { children: ReactNode; footer?: boolean }) {
  const orgName = await getOrgName();
  return (
    <Surface kind="asker" className="flex min-h-dvh flex-1 flex-col">
      <SiteHeader orgName={orgName} variant="compact" />
      <main id="content" className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-6">
        {children}
      </main>
      {footer && <SiteFooter orgName={orgName} wide={false} />}
    </Surface>
  );
}
