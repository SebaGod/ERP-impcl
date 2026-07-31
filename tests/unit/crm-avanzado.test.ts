import { describe, expect, it } from "vitest";
import {
  condicionesSeCumplen,
  describirAutomatizacion,
  evaluarCondicion,
  getAction,
  getTrigger,
  interpolar,
  type Condition,
} from "@/lib/automation/catalog";
import {
  claveDesdeEtiqueta,
  formatearValor,
  leerCamposDelFormulario,
  normalizarValor,
  validarValor,
  type FieldDef,
} from "@/lib/crm/custom-fields";

const cond = (
  campo: string,
  operador: Condition["operador"],
  valor?: string
): Condition => ({ campo, operador, valor });

describe("evaluarCondicion", () => {
  const ctx = {
    canal: "whatsapp",
    valor: 150000,
    etiqueta: ["vip", "urgente"],
    texto: "Quiero cotizar 500 volantes",
    vacio: "",
  };

  it("compara igualdad sin distinguir mayúsculas", () => {
    expect(evaluarCondicion(cond("canal", "es", "WhatsApp"), ctx)).toBe(true);
    expect(evaluarCondicion(cond("canal", "es", "instagram"), ctx)).toBe(false);
    expect(evaluarCondicion(cond("canal", "no_es", "instagram"), ctx)).toBe(true);
  });

  it("compara texto por contenido", () => {
    expect(evaluarCondicion(cond("texto", "contiene", "volantes"), ctx)).toBe(true);
    expect(evaluarCondicion(cond("texto", "no_contiene", "tarjetas"), ctx)).toBe(true);
  });

  it("compara números", () => {
    expect(evaluarCondicion(cond("valor", "mayor_que", "100000"), ctx)).toBe(true);
    expect(evaluarCondicion(cond("valor", "menor_que", "100000"), ctx)).toBe(false);
  });

  it("no compara números si el valor no es numérico", () => {
    expect(evaluarCondicion(cond("canal", "mayor_que", "5"), ctx)).toBe(false);
  });

  it("trata los arreglos por pertenencia", () => {
    expect(evaluarCondicion(cond("etiqueta", "contiene", "vip"), ctx)).toBe(true);
    expect(evaluarCondicion(cond("etiqueta", "contiene", "frio"), ctx)).toBe(false);
    expect(evaluarCondicion(cond("etiqueta", "no_contiene", "frio"), ctx)).toBe(true);
  });

  it("distingue presencia de ausencia", () => {
    expect(evaluarCondicion(cond("canal", "existe"), ctx)).toBe(true);
    expect(evaluarCondicion(cond("vacio", "existe"), ctx)).toBe(false);
    expect(evaluarCondicion(cond("noExiste", "no_existe"), ctx)).toBe(true);
    expect(evaluarCondicion(cond("etiqueta", "existe"), ctx)).toBe(true);
  });

  it("un campo ausente no revienta", () => {
    expect(evaluarCondicion(cond("fantasma", "es", "x"), ctx)).toBe(false);
  });
});

describe("condicionesSeCumplen", () => {
  const ctx = { canal: "whatsapp", valor: 200000 };

  it("sin condiciones siempre corre", () => {
    expect(condicionesSeCumplen([], ctx)).toBe(true);
  });

  it("exige que se cumplan todas", () => {
    expect(
      condicionesSeCumplen(
        [cond("canal", "es", "whatsapp"), cond("valor", "mayor_que", "100000")],
        ctx
      )
    ).toBe(true);
    expect(
      condicionesSeCumplen(
        [cond("canal", "es", "whatsapp"), cond("valor", "mayor_que", "500000")],
        ctx
      )
    ).toBe(false);
  });
});

describe("interpolar", () => {
  it("reemplaza variables del contexto", () => {
    expect(interpolar("Hola {{nombre}}, ¿seguimos?", { nombre: "Seba" })).toBe(
      "Hola Seba, ¿seguimos?"
    );
  });

  it("tolera espacios dentro de las llaves", () => {
    expect(interpolar("Hola {{ nombre }}", { nombre: "Ana" })).toBe("Hola Ana");
  });

  it("deja vacío lo que no encuentra", () => {
    expect(interpolar("Hola {{apodo}}!", {})).toBe("Hola !");
  });
});

describe("catálogo", () => {
  it("resuelve disparadores y acciones por clave", () => {
    expect(getTrigger("mensaje_entrante")?.label).toBe("Llega un mensaje");
    expect(getAction("mover_etapa")?.config[0]?.key).toBe("stage_id");
    expect(getTrigger("inexistente")).toBeUndefined();
  });

  it("describe una automatización de forma legible", () => {
    expect(
      describirAutomatizacion({
        trigger_kind: "contacto_creado",
        conditions: [cond("origen", "es", "instagram")],
        actions: [
          { tipo: "crear_oportunidad", config: {} },
          { tipo: "agregar_etiqueta", config: { tag: "nuevo" } },
        ],
      })
    ).toBe("Se crea un contacto · 1 condición · 2 acciones");
  });
});

describe("campos personalizados", () => {
  const def = (over: Partial<FieldDef> = {}): FieldDef => ({
    id: "1",
    entity: "contacto",
    key: "presupuesto",
    label: "Presupuesto",
    field_type: "numero",
    options: [],
    help: null,
    required: false,
    position: 0,
    ...over,
  });

  it("genera claves estables desde la etiqueta", () => {
    expect(claveDesdeEtiqueta("Presupuesto estimado")).toBe("presupuesto_estimado");
    expect(claveDesdeEtiqueta("N° de habitación")).toBe("n_de_habitacion");
    expect(claveDesdeEtiqueta("  ¿Cuántos? ")).toBe("cuantos");
  });

  it("normaliza según el tipo", () => {
    expect(normalizarValor("numero", "1500")).toBe(1500);
    expect(normalizarValor("numero", "abc")).toBeNull();
    expect(normalizarValor("texto", "  hola  ")).toBe("hola");
    expect(normalizarValor("texto", "")).toBeNull();
    expect(normalizarValor("booleano", "on")).toBe(true);
    expect(normalizarValor("booleano", null)).toBe(false);
  });

  it("valida obligatorios", () => {
    expect(validarValor(def({ required: true }), null)).toBe(
      "Presupuesto es obligatorio"
    );
    expect(validarValor(def({ required: false }), null)).toBeNull();
  });

  it("valida formatos", () => {
    expect(validarValor(def({ field_type: "email", label: "Correo" }), "no-es-mail")).toBe(
      "Correo no es un correo válido"
    );
    expect(validarValor(def({ field_type: "email" }), "a@b.cl")).toBeNull();
    expect(validarValor(def({ field_type: "url", label: "Web" }), "ejemplo.cl")).toBe(
      "Web debe empezar con http:// o https://"
    );
    expect(validarValor(def({ field_type: "fecha", label: "Fecha" }), "31-07-2026")).toBe(
      "Fecha no es una fecha válida"
    );
    expect(validarValor(def({ field_type: "fecha" }), "2026-07-31")).toBeNull();
  });

  it("valida que la opción exista en la lista", () => {
    const seleccion = def({
      field_type: "seleccion",
      label: "Tamaño",
      options: ["Chico", "Grande"],
    });
    expect(validarValor(seleccion, "Mediano")).toBe("Tamaño no es una opción válida");
    expect(validarValor(seleccion, "Grande")).toBeNull();
  });

  it("lee un formulario completo y corta en el primer error", () => {
    const defs = [
      def({ key: "presupuesto", field_type: "numero" }),
      def({ key: "correo", label: "Correo", field_type: "email", required: true }),
    ];
    const fd = new FormData();
    fd.set("cf_presupuesto", "50000");
    fd.set("cf_correo", "malo");

    const { error } = leerCamposDelFormulario(defs, fd);
    expect(error).toBe("Correo no es un correo válido");

    fd.set("cf_correo", "seba@heat.cl");
    const ok = leerCamposDelFormulario(defs, fd);
    expect(ok.error).toBeNull();
    expect(ok.valores).toEqual({ presupuesto: 50000, correo: "seba@heat.cl" });
  });

  it("omite los campos vacíos en vez de guardar nulos", () => {
    const defs = [def({ key: "presupuesto" })];
    const fd = new FormData();
    fd.set("cf_presupuesto", "");
    expect(leerCamposDelFormulario(defs, fd).valores).toEqual({});
  });

  it("formatea valores para mostrar", () => {
    expect(formatearValor(def({ field_type: "booleano" }), true)).toBe("Sí");
    expect(formatearValor(def({ field_type: "numero" }), 1500000)).toBe("1.500.000");
    expect(formatearValor(def(), null)).toBe("—");
  });
});
