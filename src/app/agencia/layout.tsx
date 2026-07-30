import Link from "next/link";
import { brand } from "@/config/brand";

export default function AgencyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {brand.name.charAt(0)}
          </div>
          <Link href="/agencia" className="text-sm font-semibold">
            Panel de agencia
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
