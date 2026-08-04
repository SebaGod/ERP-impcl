import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";

/**
 * Que ninguna pantalla pueda volver a quedarse en blanco.
 *
 * Este archivo existe por un agujero que estuvo abierto todo el
 * desarrollo y no se veía: setenta y dos páginas y cero error boundaries.
 * Cualquier excepción al renderizar —una consulta caída, un campo null
 * donde se esperaba un objeto— terminaba en la pantalla por defecto de
 * Next: fondo blanco, "Application error", en inglés, sin menú y sin
 * vuelta atrás. Nada fallaba en las pruebas porque nada de esto se
 * ejecuta en el camino feliz; solo aparece el día que algo se rompe,
 * que es exactamente el día en que peor se ve.
 *
 * La red no se prueba llamándola: se prueba comprobando que está
 * puesta. Estos tests leen el árbol de rutas, así que una sección nueva
 * que se agregue mañana sin boundary rompe la suite en vez de romperse
 * delante de un cliente. Es la única forma de que la garantía no dependa
 * de que alguien se acuerde.
 */

const APP = join(process.cwd(), "src", "app");

/** Todos los directorios bajo src/app, en profundidad */
function segmentos(dir: string): string[] {
  const propios: string[] = [dir];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    // Los que empiezan con _ no son rutas (convención de Next para
    // carpetas privadas) y api/ no renderiza UI: no hay nada que caerse
    // en pantalla ahí.
    if (!entrada.isDirectory()) continue;
    if (entrada.name.startsWith("_") || entrada.name === "api") continue;
    propios.push(...segmentos(join(dir, entrada.name)));
  }
  return propios;
}

const TODOS = segmentos(APP);

/** Segmentos de primer nivel que traen su propio chasis */
const CON_CHASIS_PROPIO = TODOS.filter(
  (dir) =>
    dirname(dir) === APP && existsSync(join(dir, "layout.tsx"))
);

/** El segmento de primer nivel al que pertenece una ruta */
function chasisDe(dir: string): string {
  let actual = dir;
  while (dirname(actual) !== APP && actual !== APP) actual = dirname(actual);
  return actual;
}

/**
 * Busca un archivo de convención subiendo por el árbol, sin salirse del
 * chasis al que pertenece la ruta.
 *
 * El corte es la parte que importa. Next resuelve estas convenciones
 * subiendo hasta encontrar la primera, así que la raíz siempre termina
 * cubriendo a todos —y una comprobación que acepte eso no comprueba
 * nada: pasaría igual con las cinco secciones vacías. Lo que se exige acá
 * es que la resuelva la propia sección, que es lo que hace que la
 * pantalla salga con su menú puesto en vez de reemplazar la aplicación
 * entera.
 */
function resuelveEnSuChasis(desde: string, archivo: string): boolean {
  const tope = chasisDe(desde);
  // Una ruta suelta en la raíz (la portada, el onboarding) no tiene
  // chasis propio: ahí la raíz sí es la respuesta correcta.
  const conChasisPropio = existsSync(join(tope, "layout.tsx"));
  let actual = desde;
  for (;;) {
    if (existsSync(join(actual, archivo))) return true;
    if (actual === tope) return conChasisPropio ? false : existsSync(join(APP, archivo));
    actual = dirname(actual);
  }
}

const rel = (dir: string) => relative(APP, dir) || ".";

describe("cada panel atrapa sus propios errores", () => {
  it("hay al menos cinco secciones con chasis propio", () => {
    // Si este número baja, alguien reorganizó las rutas y el resto de
    // este archivo puede estar comprobando el vacío.
    expect(CON_CHASIS_PROPIO.length).toBeGreaterThanOrEqual(5);
  });

  for (const dir of CON_CHASIS_PROPIO) {
    it(`${rel(dir)} tiene error.tsx junto a su layout`, () => {
      // Junto al layout, no más arriba: un boundary por encima del chasis
      // se lleva puesto el menú al dibujarse, y la pantalla pasa de "esta
      // sección falló" a "el sistema se murió". Son la misma excepción y
      // producen dos niveles de confianza distintos.
      expect(existsSync(join(dir, "error.tsx"))).toBe(true);
    });
  }
});

describe("los últimos recursos existen", () => {
  it("hay boundary en la raíz para las rutas sin grupo", () => {
    // Cubre la portada, el onboarding, la invitación y cualquier ruta que
    // se agregue sin acordarse de esto.
    expect(existsSync(join(APP, "error.tsx"))).toBe(true);
  });

  it("hay global-error para cuando se cae el layout raíz", () => {
    expect(existsSync(join(APP, "global-error.tsx"))).toBe(true);
  });

  it("global-error no depende de nada que se pueda haber caído", () => {
    // Solo aparece cuando ya falló lo que envuelve a todo. Si para
    // dibujarse necesita la hoja de estilos o un componente compartido,
    // el escenario que justifica su existencia es justo el que lo deja
    // sin renderizar.
    const fuente = readFileSync(join(APP, "global-error.tsx"), "utf8");
    const imports = fuente.match(/^import .+$/gm) ?? [];
    expect(imports).toEqual([]);
    // Reemplaza al layout raíz completo: le tocan sus propias etiquetas.
    expect(fuente).toContain("<html");
    expect(fuente).toContain("<body");
  });
});

describe("nadie queda varado en un 404", () => {
  /** Páginas que llaman notFound() y por lo tanto pueden mostrar un 404 */
  const conNotFound = TODOS.filter((dir) => {
    const page = join(dir, "page.tsx");
    return existsSync(page) && readFileSync(page, "utf8").includes("notFound()");
  });

  it("las pantallas de detalle siguen llamando a notFound()", () => {
    // Doce al escribir esto. El número puede crecer; que caiga a cero
    // significaría que este bloque dejó de comprobar algo.
    expect(conNotFound.length).toBeGreaterThan(0);
  });

  for (const dir of conNotFound) {
    it(`${rel(dir)} resuelve su 404 dentro de su propia sección`, () => {
      expect(resuelveEnSuChasis(dir, "not-found.tsx")).toBe(true);
    });
  }

  it("hay un not-found en la raíz para las direcciones que no existen", () => {
    // Este además atiende cualquier URL que no case con ninguna ruta: un
    // enlace mal copiado, una dirección vieja. Sin él sale el 404 de Next
    // en inglés.
    expect(existsSync(join(APP, "not-found.tsx"))).toBe(true);
  });
});

describe("un 404 nunca sale de una consulta caída", () => {
  /** Páginas que muestran un 404 y además leen de la base */
  const detalles = TODOS.filter((dir) => {
    const page = join(dir, "page.tsx");
    if (!existsSync(page)) return false;
    const fuente = readFileSync(page, "utf8");
    return fuente.includes("notFound()") && fuente.includes("supabase");
  });

  for (const dir of detalles) {
    it(`${rel(dir)} separa "no existe" de "no se pudo leer"`, () => {
      const fuente = readFileSync(join(dir, "page.tsx"), "utf8");
      // El patrón que había en las doce era `const { data: x } = await
      // supabase...` seguido de `if (!x) notFound()`: al desestructurar
      // solo data se pierde el error, y los dos casos llegan al if como
      // null. La pantalla entonces afirma que el registro no existe
      // cuando lo único cierto es que no pudo leerlo.
      expect(fuente).toContain("exigirLectura");
    });
  }
});

describe("ninguna consulta se cae en silencio", () => {
  /**
   * Páginas que delegan sus consultas a un módulo aparte.
   *
   * No es una excepción a la regla: es la misma regla comprobada en el
   * archivo donde vive la consulta. `getReceivables` y `origen.ts` sí
   * usan exigirLectura, y en el caso de las cuentas por cobrar es donde
   * más falta hacía —un fallo ahí no vacía la lista, la infla, porque
   * sin los pagos leídos todos los clientes aparecen debiendo el total.
   */
  const DELEGAN = new Set([
    "(app)/finanzas/por-cobrar",
    "(app)/documentos/nuevo",
  ]);

  const consultan = TODOS.filter((dir) => {
    const page = join(dir, "page.tsx");
    return existsSync(page) && readFileSync(page, "utf8").includes("supabase");
  });

  it("hay bastantes páginas consultando (si no, este bloque no mide nada)", () => {
    expect(consultan.length).toBeGreaterThan(40);
  });

  for (const dir of consultan) {
    const nombre = rel(dir);
    if (DELEGAN.has(nombre)) continue;
    it(`${nombre} mira si la consulta falló`, () => {
      const fuente = readFileSync(join(dir, "page.tsx"), "utf8");
      // Desestructurar solo `data` deja el error en el suelo, y el
      // resultado es una pantalla que se ve sana: una lista vacía en vez
      // de una lista rota, un total en cero en vez de un total ausente.
      // Es peor que un error a la vista porque nadie lo reporta —quien
      // la mira concluye que no tiene datos y sigue trabajando con eso.
      const mira =
        fuente.includes("exigirLectura") ||
        fuente.includes("QueryError") ||
        fuente.includes(".error") ||
        // La otra forma válida: desestructurar el error junto al dato y
        // decidir en la pantalla qué hacer con él, como hacen canales y
        // subcuentas. Lo que no vale es `{ data: x }` a secas.
        /\{\s*data\s*,\s*error\s*\}/.test(fuente);
      expect(mira).toBe(true);
    });
  }
});

describe("los endpoints tampoco fallan callados", () => {
  /**
   * El barrido de páginas no alcanzaba a los route handlers, y por ahí se
   * coló una exportación que entregaba un CSV con solo cabeceras cuando
   * la consulta fallaba: un archivo que se abre igual que uno legítimo y
   * hace concluir que ese mes no hubo movimientos.
   */
  const DELEGAN = new Set([
    // Reciben el mensaje y lo pasan a un módulo que sí registra el fallo
    // en la bitácora (inbound.ts, follow-up-runner.ts).
    "api/webhooks/meta",
    "api/cron/seguimientos",
  ]);

  // Recorrido propio: `segmentos()` salta api/ porque ahí no hay UI que
  // se pueda quedar en blanco, pero sí hay consultas que se pueden caer.
  function conRuta(dir: string): string[] {
    const salida: string[] = [];
    if (existsSync(join(dir, "route.ts"))) salida.push(dir);
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (!entrada.isDirectory() || entrada.name.startsWith("_")) continue;
      salida.push(...conRuta(join(dir, entrada.name)));
    }
    return salida;
  }

  const handlers = conRuta(APP)
    .filter((dir) =>
      readFileSync(join(dir, "route.ts"), "utf8").includes("supabase")
    )
    .map(rel);

  it("hay endpoints que consultan la base", () => {
    expect(handlers.length).toBeGreaterThan(3);
  });

  for (const nombre of handlers) {
    if (DELEGAN.has(nombre)) continue;
    it(`${nombre} mira si la consulta falló`, () => {
      const fuente = readFileSync(join(APP, nombre, "route.ts"), "utf8");
      const mira =
        fuente.includes("exigirLectura") ||
        fuente.includes(".error") ||
        /\{\s*(data\s*,\s*)?error\s*\}/.test(fuente);
      expect(mira).toBe(true);
    });
  }
});

describe("los boundaries usan la API de esta versión de Next", () => {
  const boundaries = TODOS.flatMap((dir) => {
    const salida: string[] = [];
    for (const archivo of ["error.tsx", "global-error.tsx"]) {
      const ruta = join(dir, archivo);
      if (existsSync(ruta)) salida.push(ruta);
    }
    return salida;
  });

  for (const ruta of boundaries) {
    it(`${relative(APP, ruta)} recibe unstable_retry y es de cliente`, () => {
      const fuente = readFileSync(ruta, "utf8");
      // En Next 16 la prop de reintento se llama unstable_retry. La
      // versión anterior pasaba `reset`, que solo limpiaba el estado sin
      // volver a pedir los datos: en un error de server component el
      // botón se veía igual y no arreglaba nada.
      expect(fuente).toContain("unstable_retry");
      // Un error boundary tiene que ser componente de cliente.
      expect(fuente.startsWith('"use client"')).toBe(true);
    });
  }
});
