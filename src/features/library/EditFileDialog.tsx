import { Button, Dialog, Field, IconButton, Input, Stack, Text } from "@chakra-ui/react";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { fileDisplayName, type GpxFile } from "../../lib/types/models";

interface EditFileDialogProps {
  open: boolean;
  /** When set, the dialog edits this file's display name. */
  file: GpxFile | null;
  onClose: () => void;
  /** Rename only; resolves when done, throws to keep the dialog open on failure. */
  onRename: (name: string) => Promise<void>;
  /** Rename (if changed) then open the trace editor. */
  onEdit: (name: string) => Promise<void>;
}

/** Combined rename + edit entry point opened from the library's Edit action. */
export function EditFileDialog({ open, file, onClose, onRename, onEdit }: EditFileDialogProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"rename" | "edit" | null>(null);

  useEffect(() => {
    if (open && file) setName(fileDisplayName(file));
  }, [open, file]);

  async function run(action: "rename" | "edit") {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(action);
    try {
      if (action === "rename") await onRename(trimmed);
      else await onEdit(trimmed);
      onClose();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Edit file</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <IconButton aria-label="Close" variant="ghost" size="sm">
                <XIcon />
              </IconButton>
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap="4">
              {file && (
                <Text color="fg.muted" textStyle="sm">
                  Original file name: {file.originalName}
                </Text>
              )}
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder={file?.originalName ?? "File name"}
                  autoFocus
                />
              </Field.Root>
              <Text color="fg.muted" textStyle="xs">
                Rename the file in the library, or rename and open it in the trace editor.
              </Text>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void run("rename")}
              loading={busy === "rename"}
              disabled={!name.trim() || busy !== null}
            >
              Rename
            </Button>
            <Button
              onClick={() => void run("edit")}
              loading={busy === "edit"}
              disabled={!name.trim() || busy !== null}
            >
              Edit trace
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
