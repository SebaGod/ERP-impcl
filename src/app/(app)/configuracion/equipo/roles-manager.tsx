"use client";

import { useActionState, useCallback, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  groupLabels,
  moduleGroups,
  modules,
  PERFILES_SUGERIDOS,
} from "@/lib/auth/permissions";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import {
  asignarPerfil,
  eliminarPerfil,
  guardarPerfil,
  type ActionState,
} from "./roles-actions";

export interface PerfilRow {
  id: string;
  label: string;
  description: string | null;
  base_role: "admin" | "operario";
  permissions: string[];
}

const initialState: ActionState = { error: null };

const baseRoleLabels: Record<PerfilRow["base_role"], string> = {
  admin: "Administrador",
  operario: "Operario",
};

export function RolesManager({
  perfiles,
  totalPorPerfil,
}: {
  perfiles: PerfilRow[];
  totalPorPerfil: Record<string, number>;
}) {
  const [editando, setEditando] = useState<PerfilRow | null>(null);
  const [creando, setCreando] = useState(false);

  const cerrar = useCallback(() => {
    setEditando(null);
    setCreando(false);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {perfiles.length === 0 && !creando && (
        <p className="text-sm text-muted-foreground">
          Aún no hay perfiles. Un perfil define qué módulos ve cada persona;
          crea uno desde cero o parte de una plantilla.
        </p>
      )}

      {perfiles.length > 0 && (
        <div className="flex flex-col gap-2">
          {perfiles.map((perfil) =>
            editando?.id === perfil.id ? (
              <PerfilForm key={perfil.id} perfil={perfil} onDone={cerrar} />
            ) : (
              <PerfilCard
                key={perfil.id}
                perfil={perfil}
                personas={totalPorPerfil[perfil.id] ?? 0}
                onEditar={() => {
                  setCreando(false);
                  setEditando(perfil);
                }}
              />
            )
          )}
        </div>
      )}

      {creando ? (
        <PerfilForm perfil={null} onDone={cerrar} />
      ) : (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditando(null);
              setCreando(true);
            }}
          >
            <Plus className="size-4" /> Nuevo perfil
          </Button>
        </div>
      )}
    </div>
  );
}

function PerfilCard({
  perfil,
  personas,
  onEditar,
}: {
  perfil: PerfilRow;
  personas: number;
  onEditar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, startEliminar] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{perfil.label}</p>
          <Badge variant={perfil.base_role === "admin" ? "default" : "outline"}>
            {baseRoleLabels[perfil.base_role]}
          </Badge>
        </div>
        {perfil.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {perfil.description}
          </p>
        )}
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {perfil.permissions.length}{" "}
          {perfil.permissions.length === 1 ? "módulo" : "módulos"} · {personas}{" "}
          {personas === 1 ? "persona lo usa" : "personas lo usan"}
        </p>
      </div>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            ¿Eliminar? Quienes lo usan vuelven a los permisos de su rol base.
          </span>
          <button
            type="button"
            onClick={() =>
              startEliminar(async () => {
                await eliminarPerfil(perfil.id);
                setConfirmando(false);
              })
            }
            disabled={eliminando}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors duration-150 hover:bg-muted disabled:opacity-50"
          >
            {eliminando ? "Eliminando…" : "Sí, eliminar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={eliminando}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-50"
            title="Cancelar"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEditar}
            title="Editar perfil"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            title="Eliminar perfil"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PerfilForm({
  perfil,
  onDone,
}: {
  perfil: PerfilRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    guardarPerfil,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Cierra el formulario solo cuando la acción resolvió sin error.
  useResetOnSuccess(state, formRef, onDone);

  const [label, setLabel] = useState(perfil?.label ?? "");
  const [description, setDescription] = useState(perfil?.description ?? "");
  const [baseRole, setBaseRole] = useState<PerfilRow["base_role"]>(
    perfil?.base_role ?? "operario"
  );
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(perfil?.permissions ?? [])
  );

  const aplicarPlantilla = (plantilla: (typeof PERFILES_SUGERIDOS)[number]) => {
    setLabel(plantilla.label);
    setDescription(plantilla.description);
    setBaseRole(plantilla.base_role);
    setMarcados(new Set(plantilla.permissions));
  };

  const alternar = (key: string) => {
    setMarcados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(key)) {
        siguiente.delete(key);
      } else {
        siguiente.add(key);
      }
      return siguiente;
    });
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-primary/40 bg-muted/30 p-4"
    >
      {perfil && <input type="hidden" name="id" value={perfil.id} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {perfil ? `Editar perfil: ${perfil.label}` : "Nuevo perfil"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Usar plantilla:</span>
          {PERFILES_SUGERIDOS.map((plantilla) => (
            <button
              key={plantilla.key}
              type="button"
              onClick={() => aplicarPlantilla(plantilla)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              {plantilla.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="perfil-label">Nombre del perfil</Label>
          <Input
            id="perfil-label"
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Vendedor"
            maxLength={60}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="perfil-base-role">Rol base</Label>
          <Select
            id="perfil-base-role"
            name="base_role"
            value={baseRole}
            onChange={(event) =>
              setBaseRole(
                event.target.value === "admin" ? "admin" : "operario"
              )
            }
          >
            <option value="operario">Operario</option>
            <option value="admin">Administrador</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            El rol base define lo que la persona PUEDE tocar por seguridad; los
            módulos definen lo que VE.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="perfil-description">Descripción</Label>
        <Textarea
          id="perfil-description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="min-h-16"
          placeholder="Qué hace la persona que trabaja con este perfil"
        />
      </div>

      <div className="flex flex-col gap-4">
        {moduleGroups.map((group) => (
          <div key={group} className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {groupLabels[group]}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {modules
                .filter((m) => m.group === group)
                .map((m) => {
                  const deshabilitado =
                    Boolean(m.soloAdmin) && baseRole === "operario";
                  return (
                    <label
                      key={m.key}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors duration-150",
                        deshabilitado
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-muted"
                      )}
                    >
                      <input
                        type="checkbox"
                        name="permissions"
                        value={m.key}
                        checked={marcados.has(m.key) && !deshabilitado}
                        onChange={() => alternar(m.key)}
                        disabled={deshabilitado}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {m.label}
                          {m.soloAdmin && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {" "}
                              · solo rol admin
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {m.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : perfil
              ? "Guardar cambios"
              : "Crear perfil"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Select compacto para la fila de un miembro del equipo: asigna un perfil o
 * vuelve a los permisos derivados del rol base ("Permisos por rol").
 */
export function AsignarPerfil({
  userId,
  roleDefId,
  perfiles,
}: {
  userId: string;
  roleDefId: string | null;
  perfiles: PerfilRow[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label="Perfil de acceso"
      defaultValue={roleDefId ?? ""}
      disabled={pending}
      onChange={(event) => {
        const valor = event.target.value || null;
        startTransition(async () => {
          await asignarPerfil(userId, valor);
        });
      }}
      className="h-8 w-auto min-w-40 text-xs"
    >
      <option value="">Permisos por rol</option>
      {perfiles.map((perfil) => (
        <option key={perfil.id} value={perfil.id}>
          {perfil.label}
        </option>
      ))}
    </Select>
  );
}
