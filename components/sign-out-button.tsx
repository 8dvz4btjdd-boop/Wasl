import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

type SignOutButtonProps = {
  label: string;
  /** Where to land afterwards: staff go back to login, askers to home. */
  to: "/login" | "/";
};

export function SignOutButton({ label, to }: SignOutButtonProps) {
  const locale = useLocale();
  return (
    <form action={signOut}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="to" value={to} />
      <Button type="submit" variant="outline">
        {label}
      </Button>
    </form>
  );
}
