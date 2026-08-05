import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Que ninguna tabla nueva quede fuera de la prueba de aislamiento.
 *
 * El test de aislamiento nació cuando la aplicación tenía CRM y
 * producción, con veinticuatro tablas escritas a mano. Después llegaron
 * las conversaciones de WhatsApp, los documentos tributarios, el agente y
 * las automatizaciones —treinta y dos tablas— y ninguna entró a la lista.
 * Nadie lo decidió: simplemente no había nada que lo recordara.
 *
 * El problema de fondo es que la prueba más importante del sistema —que
 * una empresa no vea los datos de otra— dependía de que alguien se
 * acordara de ampliarla. Y no se nota cuando falta: el test sigue en
 * verde, solo que probando menos.
 *
 * Esta comprobación lee las migraciones, saca las tablas que tienen
 * `org_id` —o sea las que pertenecen a una empresa— y exige que cada una
 * esté en la prueba de aislamiento o en la lista de excepciones de abajo,
 * cada una con su motivo escrito. Agregar una tabla y olvidarla rompe la
 * suite; excluirla a propósito obliga a justificarlo.
 */

const MIGRACIONES = join(process.cwd(), "supabase", "migrations");
const AISLAMIENTO = join(process.cwd(), "tests", "rls", "isolation.test.ts");

/**
 * Tablas con org_id que a propósito NO entran a la prueba de aislamiento.
 * El motivo va escrito porque dentro de un año nadie se acuerda.
 */
const EXCEPCIONES: Record<string, string> = {
  // Se escriben con la llave de servicio desde el webhook y el cron; su
  // política de lectura es la misma is_member, pero sembrarlas exige
  // simular un mensaje entrante completo. Las cubre meta-inbound.test.ts.
  ai_agent_runs: "la siembra exige una corrida real del agente",
  automation_runs: "la siembra exige disparar una automatización",
  webhook_events: "solo la escribe el webhook con la llave de servicio",
  // Bitácora: la cubre bitacora-errores.test.ts, que además comprueba
  // que un miembro no pueda sembrar errores en otra organización.
  error_log: "cubierta por bitacora-errores.test.ts",
  // Sin filas propias: es un contador por organización que solo toca la
  // llave de servicio, y tiene RLS encendido sin ninguna política, o sea
  // cerrado a cal y canto para cualquier sesión.
  org_counters: "RLS sin políticas: nadie con sesión la alcanza",
  // Llega desde Meta sin sesión y su política de lectura es `false`.
  data_deletion_requests: "política de lectura en false para todos",
  // Bitácora de la agencia, no de la empresa: lleva org_id para poder
  // decir a qué subcuenta se refiere el evento, pero el dueño del dato es
  // la agencia y su política mira agency_id. El eje que se prueba acá es
  // empresa contra empresa.
  agency_events: "el dueño del dato es la agencia, no la empresa",
};

/** Tablas declaradas en las migraciones, con las columnas de su CREATE */
function tablasDeMigraciones(): Map<string, string> {
  const tablas = new Map<string, string>();
  const archivos = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const archivo of archivos) {
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8");
    // create table [if not exists] public.X ( ...cuerpo... );
    const re =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const nombre = m[1];
      // El cuerpo va desde el paréntesis hasta el que lo cierra
      let profundidad = 0;
      let i = re.lastIndex - 1;
      const inicio = i;
      for (; i < sql.length; i++) {
        if (sql[i] === "(") profundidad++;
        else if (sql[i] === ")") {
          profundidad--;
          if (profundidad === 0) break;
        }
      }
      tablas.set(nombre, sql.slice(inicio, i));
    }
  }
  return tablas;
}

const TABLAS = tablasDeMigraciones();

/** Lo que el test de aislamiento declara en sus dos listas */
function tablasProbadas(): Set<string> {
  const src = readFileSync(AISLAMIENTO, "utf8");
  const listas = src.slice(0, src.indexOf("const ALL_TABLES"));
  return new Set(
    [...listas.matchAll(/^\s*"([a-z_]+)",/gm)].map((m) => m[1])
  );
}

const PROBADAS = tablasProbadas();

describe("la prueba de aislamiento cubre todo lo que pertenece a una empresa", () => {
  it("las migraciones declaran una cantidad razonable de tablas", () => {
    // Si esto se cae a cero, el parser dejó de encontrar los CREATE y todo
    // lo de abajo pasaría comprobando el vacío.
    expect(TABLAS.size).toBeGreaterThan(40);
  });

  it("el test de aislamiento declara sus tablas donde se pueden leer", () => {
    expect(PROBADAS.size).toBeGreaterThan(20);
  });

  const conOrgId = [...TABLAS.entries()]
    .filter(([, cuerpo]) => /\borg_id\b/.test(cuerpo))
    .map(([nombre]) => nombre)
    .sort();

  it("hay tablas con org_id que revisar", () => {
    expect(conOrgId.length).toBeGreaterThan(30);
  });

  for (const tabla of conOrgId) {
    it(`${tabla} está en la prueba de aislamiento o justificada`, () => {
      const cubierta = PROBADAS.has(tabla) || tabla in EXCEPCIONES;
      expect(
        cubierta,
        `La tabla "${tabla}" guarda datos de una empresa y nadie comprueba ` +
          `que otra no los vea. Agrégala a MEMBER_TABLES o ADMIN_ONLY_TABLES ` +
          `en isolation.test.ts (y siémbrala en seedOrg), o anótala en ` +
          `EXCEPCIONES con el motivo.`
      ).toBe(true);
    });
  }

  it("no quedan excepciones de tablas que ya no existen", () => {
    // Una excusa que sobrevive a su tabla es una excusa que tapa la
    // siguiente: si alguien crea otra con ese nombre, entra exenta.
    const fantasmas = Object.keys(EXCEPCIONES).filter((t) => !TABLAS.has(t));
    expect(fantasmas, `excepciones sin tabla: ${fantasmas.join(", ")}`).toEqual(
      []
    );
  });

  it("ninguna excepción está además en la lista de probadas", () => {
    // Si se probó, la excusa sobra y confunde a quien la lea.
    const duplicadas = Object.keys(EXCEPCIONES).filter((t) => PROBADAS.has(t));
    expect(duplicadas, `sobran en EXCEPCIONES: ${duplicadas.join(", ")}`).toEqual(
      []
    );
  });
});
