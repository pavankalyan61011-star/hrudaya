import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/auth";
import { logout } from "@/app/login/actions";

export default async function ProceduresLayout({ children }: { children: React.ReactNode }) {
  // The middleware already redirects signed-out users; this is the second check.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
          <Link href="/procedures" className="inline-flex min-h-11 items-center text-lg font-bold">
            Hrudaya
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 sm:inline">
              Synthetic data only
            </span>
            <form action={logout}>
              <button type="submit" className="btn-secondary min-h-11 px-3 text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
    </div>
  );
}
