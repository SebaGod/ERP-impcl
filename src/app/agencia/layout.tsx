import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { brand } from "@/config/brand";
import { AgencyNav } from "./agency-nav";

export default async function AgencyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionContext();
  const hasAgency = Boolean(session?.agency);

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/agencia" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {(session?.agency?.name ?? brand.name).charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-semibold">
              {session?.agency?.name ?? "Panel de agencia"}
            </span>
          </Link>

          {hasAgency && <AgencyNav />}

          {session?.org && (
            <Link
              href="/inicio"
              className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Volver a {session.org.name}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
