import {
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLibraryStore } from "../../lib/stores/libraryStore";

interface SaveTraceDialogProps {
  open: boolean;
  /** Prefilled name (previous save's name or "New trace"). */
  defaultName: string;
  /** First save only — the project the file lands in. */
  allowProject?: boolean;
  onClose: () => void;
  onSave: (name: string, projectId: number | null) => Promise<void>;
}

/** Name + optional project assignment for saving the in-memory trace to the library. */
export function SaveTraceDialog({
  open,
  defaultName,
  allowProject = true,
  onClose,
  onSave,
}: SaveTraceDialogProps) {
  const projects = useLibraryStore((s) => s.projects);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed, allowProject && projectId !== "" ? Number(projectId) : null);
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
            <Dialog.Title>{allowProject ? "Save trace to library" : "Save trace"}</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <IconButton aria-label="Close" variant="ghost" size="sm">
                <XIcon />
              </IconButton>
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap="4">
              <Field.Root required>
                <Field.Label>Trace name</Field.Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="e.g. Spring Trail Marathon"
                  autoFocus
                />
              </Field.Root>
              {allowProject && (
                <Field.Root>
                  <Field.Label>Project (optional)</Field.Label>
                  <NativeSelect.Root size="md">
                    <NativeSelect.Field
                      aria-label="Assign to project"
                      value={projectId}
                      onChange={(event) => setProjectId(event.currentTarget.value)}
                    >
                      <option value="">No project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              )}
              <Text color="fg.muted" textStyle="xs">
                The trace is serialized as GPX and stored in the managed library.
              </Text>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving} disabled={!name.trim()}>
              Save
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
