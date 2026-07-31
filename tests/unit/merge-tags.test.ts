import { describe, expect, it } from "vitest";
import {
  construirContexto,
  envolver,
  tagDeCampo,
  tagsDesconocidas,
  tagsDisponibles,
  tagsUsadas,
} from "@/lib/crm/merge-tags";
import { interpolar } from "@/lib/automation/catalog";

describe("claves de fusión", () => {
  it("prefija los campos personalizados para no chocar con los fijos", () => {
    // Un campo personalizado llamado "nombre" no debe pisar contacto.nombre
    expect(
      tagDeCampo({ entity: "contacto", key: "nombre", label: "Nombre del hijo" }).key
    ).toBe("contacto.cf.nombre");
    expect(
      tagDeCampo({ entity: "oportunidad", key: "descuento", label: "Descuento" }).key
    ).toBe("oportunidad.cf.descuento");
  });

  it("agrupa las disponibles para el selector", () => {
    const grupos = tagsDisponibles([
      { entity: "contacto", key: "presupuesto", label: "Presupuesto" },
    ]);
    const nombres = grupos.map((g) => g.group);
    expect(nombres).toContain("Contacto");
    expect(nombres).toContain("Campos personalizados de contacto");

    const personalizados = grupos.find(
      (g) => g.group === "Campos personalizados de contacto"
    );
    expect(personalizados?.tags[0]?.key).toBe("contacto.cf.presupuesto");
  });

  it("envuelve en llaves", () => {
    expect(envolver("contacto.nombre")).toBe("{{contacto.nombre}}");
  });

  it("extrae las claves usadas sin repetir", () => {
    const texto = "Hola {{contacto.nombre}}, tu {{contacto.cf.auto}} y {{contacto.nombre}}";
    expect(tagsUsadas(texto)).toEqual(["contacto.nombre", "contacto.cf.auto"]);
  });

  it("detecta claves que no existen", () => {
    const disponibles = ["contacto.nombre"];
    expect(
      tagsDesconocidas("Hola {{contacto.nombre}} y {{contacto.inventado}}", disponibles)
    ).toEqual(["contacto.inventado"]);
    expect(tagsDesconocidas("Hola {{contacto.nombre}}", disponibles)).toEqual([]);
  });
});

describe("construirContexto", () => {
  const contacto = {
    name: "María Pérez",
    email: "maria@empresa.cl",
    phone: "+56912345678",
    company: "Comercial Andes",
    rut: "76.543.210-3",
    source: "instagram",
    lifecycle: "lead",
    score: 80,
    custom_fields: { presupuesto: 500000, auto: "Toyota Yaris" },
  };

  it("mapea los campos fijos del contacto", () => {
    const ctx = construirContexto({ contacto });
    expect(ctx["contacto.nombre"]).toBe("María Pérez");
    expect(ctx["contacto.calificacion"]).toBe(80);
  });

  it("expone los campos personalizados con su prefijo", () => {
    const ctx = construirContexto({ contacto });
    expect(ctx["contacto.cf.presupuesto"]).toBe(500000);
    expect(ctx["contacto.cf.auto"]).toBe("Toyota Yaris");
  });

  it("incluye oportunidad, negocio, canal y fecha", () => {
    const ctx = construirContexto({
      oportunidad: { title: "Impresión de volantes", value: 250000, custom_fields: {} },
      negocio: { nombre: "Libreria La Pluma" },
      canal: "WhatsApp",
      hoy: "31-07-2026",
    });
    expect(ctx["oportunidad.titulo"]).toBe("Impresión de volantes");
    expect(ctx["negocio.nombre"]).toBe("Libreria La Pluma");
    expect(ctx["conversacion.canal"]).toBe("WhatsApp");
    expect(ctx["fecha.hoy"]).toBe("31-07-2026");
  });

  it("no revienta sin entidades", () => {
    expect(() => construirContexto({})).not.toThrow();
    expect(construirContexto({ contacto: null })["contacto.nombre"]).toBeUndefined();
  });

  it("se integra con interpolar para armar el mensaje final", () => {
    const ctx = construirContexto({ contacto, canal: "WhatsApp" });
    expect(
      interpolar(
        "Hola {{contacto.nombre}}, vimos tu interés en {{contacto.cf.auto}}.",
        ctx
      )
    ).toBe("Hola María Pérez, vimos tu interés en Toyota Yaris.");
  });
});
