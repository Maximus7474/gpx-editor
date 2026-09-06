import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { Button, type ButtonProps } from "@chakra-ui/react";
import { toaster } from "./ui/toaster";
import { useLibraryStore } from "../lib/stores/libraryStore";

const GPX_FILTERS = [{ name: "GPX files", extensions: ["gpx"] }];

interface ImportButtonProps {
  /** Project the imported files are assigned to (null = unassigned). */
  projectId: number | null;
  label?: string;
}

export function ImportButton({ projectId, label = "Import", ...rest }: ImportButtonProps & ButtonProps) {
  const importFiles = useLibraryStore((s) => s.importFiles);
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: GPX_FILTERS,
      title: "Import GPX files",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];

    setBusy(true);
    try {
      const result = await importFiles(paths, projectId);
      const { imported, failed } = result;
      if (imported.length > 0) {
        toaster.create({
          title: `Imported ${imported.length} file${imported.length === 1 ? "" : "s"}`,
          type: "success",
        });
      }
      for (const failure of failed) {
        toaster.create({
          title: `Could not import ${failure.fileName}`,
          description: failure.error,
          type: "error",
        });
      }
    } catch (error) {
      toaster.create({
        title: "Import failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button {...rest} onClick={handleImport} loading={busy} disabled={busy}>
      <UploadSimpleIcon aria-hidden />
      {label}
    </Button>
  );
}
