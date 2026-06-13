"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { registerWorkOrderFile, deleteWorkOrderFile } from "../actions";

const MAX_FILE_MB = 25;

export interface WorkOrderFile {
  id: string;
  file_name: string;
  size_bytes: number | null;
  signedUrl: string | null;
  canDelete: boolean;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPanel({
  orgId,
  workOrderId,
  files,
}: {
  orgId: string;
  workOrderId: string;
  files: WorkOrderFile[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_FILE_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${orgId}/${workOrderId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("work-order-files")
        .upload(storagePath, file);
      if (uploadError) {
        setError("No pudimos subir el archivo. Intenta de nuevo.");
        return;
      }

      const result = await registerWorkOrderFile(workOrderId, {
        storagePath,
        fileName: file.name,
        sizeBytes: file.size,
      });
      if (result.error) setError(result.error);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <FileRow key={file.id} workOrderId={workOrderId} file={file} />
      ))}
      {files.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sube el arte, la prueba de color o cualquier archivo del trabajo.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {uploading ? "Subiendo…" : "Subir archivo"}
        </Button>
      </div>
    </div>
  );
}

function FileRow({
  workOrderId,
  file,
}: {
  workOrderId: string;
  file: WorkOrderFile;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
      {file.signedUrl ? (
        <a
          href={file.signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
        >
          {file.file_name}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{file.file_name}</span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatSize(file.size_bytes)}
      </span>
      {file.canDelete && (
        <button
          onClick={() => {
            if (!window.confirm(`¿Eliminar "${file.file_name}"?`)) return;
            startTransition(async () => {
              await deleteWorkOrderFile(file.id, workOrderId);
            });
          }}
          disabled={isPending}
          title="Eliminar archivo"
          className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
