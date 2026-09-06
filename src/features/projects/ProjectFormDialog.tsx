import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  Stack,
  Textarea,
} from "@chakra-ui/react";
import type { Project } from "../../lib/types/models";

interface ProjectFormDialogProps {
  open: boolean;
  /** When set, the dialog edits this project (rename) instead of creating. */
  project: Project | null;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}

export function ProjectFormDialog({ open, project, onClose, onSubmit }: ProjectFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setDescription(project?.description ?? "");
    }
  }, [open, project]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim(), description.trim());
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
            <Dialog.Title>{project ? "Rename project" : "New project"}</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <IconButton aria-label="Close" variant="ghost" size="sm">
                <X />
              </IconButton>
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap="4">
              <Field.Root required>
                <Field.Label>Project name</Field.Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="e.g. Spring Trail Marathon"
                  autoFocus
                />
              </Field.Root>
              {!project && (
                <Field.Root>
                  <Field.Label>Description (optional)</Field.Label>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.currentTarget.value)}
                    placeholder="What is this event?"
                    rows={3}
                  />
                </Field.Root>
              )}
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} loading={saving} disabled={!name.trim()}>
              {project ? "Rename" : "Create project"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
