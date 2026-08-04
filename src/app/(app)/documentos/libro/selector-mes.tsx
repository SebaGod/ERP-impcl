"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import type { Mes } from "./periodo";

/**
 * El mes viaja en la URL para que "el libro de julio" sea un enlace que se
 * puede mandar al contador por WhatsApp y abrir igual en su computador.
 */
export function SelectorMes({
  meses,
  actual,
}: {
  meses: Mes[];
  actual: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = useTransition();

  return (
    <Select
      value={actual}
      disabled={pendiente}
      onChange={(e) =>
        startTransition(() => {
          router.replace(`${pathname}?mes=${e.target.value}`, { scroll: false });
        })
      }
      className="h-10 w-auto capitalize"
      aria-label="Mes del libro"
    >
      {meses.map((m) => (
        <option key={m.clave} value={m.clave} className="capitalize">
          {m.label}
        </option>
      ))}
    </Select>
  );
}
