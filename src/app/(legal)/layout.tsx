import Link from "next/link";
import { brand } from "@/config/brand";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-base font-bold">
            {brand.name}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/eliminar-datos" className="hover:text-foreground">
              Eliminar datos
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground shadow-sm sm:p-9 [&_a]:text-primary [&_a]:underline [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-1 [&_p]:text-muted-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5 [&_ul]:text-muted-foreground">
          {children}
        </article>
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {brand.name}. Todos los derechos reservados.
      </footer>
    </div>
  );
}
