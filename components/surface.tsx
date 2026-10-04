import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SurfaceKind = "asker" | "workspace";
type SurfaceTheme = "light" | "dark";

const DEFAULT_THEME: Record<SurfaceKind, SurfaceTheme> = {
  asker: "dark",
  workspace: "light",
};

type SurfaceProps = ComponentProps<"div"> & {
  kind: SurfaceKind;
  theme?: SurfaceTheme;
};

// Scopes the token set in app/globals.css. Always sets data-theme so `dark:` works.
export function Surface({ kind, theme, className, ...props }: SurfaceProps) {
  return (
    <div
      data-surface={kind}
      data-theme={theme ?? DEFAULT_THEME[kind]}
      className={cn("bg-background text-foreground", className)}
      {...props}
    />
  );
}
