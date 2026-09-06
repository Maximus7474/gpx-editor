import { Button, Dialog, Field, IconButton, Input, Stack, Text } from "@chakra-ui/react";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { fileDisplayName, type GpxFile } from "../../lib/types/models";

interface RenameFileDialogProps {
  open: boolean;
  /** When set, the dialog edits this file's display name. */
  file: GpxFile | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function RenameFileDialog({ open, file, onClose, onSubmit }: RenameFileDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && file) setName(fileDisplayName(file));
  }, [open, file]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setSaving(false);
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
            <Dialog.Title>Rename file</Dialog.Title>
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
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} loading={saving} disabled={!name.trim()}>
              Rename
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
