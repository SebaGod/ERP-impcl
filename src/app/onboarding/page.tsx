import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { getSessionContext } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Crea tu organización" };

export default async function OnboardingPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (session.org) redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
          {brand.name.charAt(0)}
        </div>
        <h1 className="text-xl font-bold">Crea tu organización</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Dejaremos tu espacio listo con las etapas de producción, el catálogo
          de productos y las categorías de gastos típicas de una imprenta.
          Todo es editable después.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <OnboardingForm />
      </div>
    </div>
  );
}
