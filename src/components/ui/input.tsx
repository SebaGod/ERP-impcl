import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // 16px en el teléfono, 14px de ahí para arriba.
        //
        // No es una preferencia estética: Safari en iOS hace zoom solo
        // cuando enfocas un campo de menos de 16px, y no lo deshace al
        // salir. Quedas con la página ampliada, desplazada a la derecha y
        // teniendo que pellizcar para volver — en cada formulario, cada
        // vez. Es de las cosas que más hacen sentir "esto no está hecho
        // para el celular", y se arregla con un tamaño de letra.
        "h-10 w-full rounded-lg border border-border bg-card px-3 text-base md:text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
