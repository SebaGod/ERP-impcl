"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Resetea el formulario (y ejecuta un callback opcional) cuando una
 * server action vía useActionState termina SIN error. Corrige el bug de
 * limpiar o cerrar el formulario de forma síncrona, antes de que la
 * acción asíncrona resuelva.
 */
export function useResetOnSuccess(
  state: { error: string | null },
  formRef: RefObject<HTMLFormElement | null>,
  onSuccess?: () => void
) {
  const seen = useRef(state);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (!state.error) {
      formRef.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess, formRef]);
}
