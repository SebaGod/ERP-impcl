import Link from "next/link";
import { brand } from "@/config/brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
          {brand.name.charAt(0)}
        </div>
        <h1 className="text-xl font-bold">{brand.name}</h1>
        <p className="text-center text-sm text-muted-foreground">
          {brand.tagline}
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <nav className="flex items-center gap-4 text-xs text-muted-foreground">
        <Link href="/privacidad" className="hover:text-foreground">
          Privacidad
        </Link>
        <span aria-hidden>·</span>
        <Link href="/eliminar-datos" className="hover:text-foreground">
          Eliminar datos
        </Link>
      </nav>
    </div>
  );
}
