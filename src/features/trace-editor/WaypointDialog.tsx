import {
  Box,
  Button,
  Dialog,
  Field,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toaster } from "../../components/ui/toaster";
import { useTraceEditorStore } from "../../lib/stores/traceEditorStore";
import {
  type EditorWaypoint,
  WAYPOINT_CATEGORIES,
  type WaypointCategoryId,
  waypointCategory,
} from "../../lib/types/trace";

interface WaypointDialogProps {
  /** The waypoint being edited, or null when closed. */
  waypoint: EditorWaypoint | null;
  onClose: () => void;
}

/**
 * Edit dialog for a waypoint: its optional name plus its category (checkpoint,
 * hydration station, first aid, start/finish, parking…). Deleting is possible
 * from here too — both save and delete go through the store, so they are
 * undoable.
 */
export function WaypointDialog({ waypoint, onClose }: WaypointDialogProps) {
  const updateWaypoint = useTraceEditorStore((s) => s.updateWaypoint);
  const deleteWaypoint = useTraceEditorStore((s) => s.deleteWaypoint);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WaypointCategoryId>("checkpoint");

  useEffect(() => {
    if (waypoint) {
      setName(waypoint.name ?? "");
      setCategory(waypoint.category);
    }
  }, [waypoint]);

  const open = waypoint !== null;

  function handleSave() {
    if (!waypoint) return;
    updateWaypoint(waypoint.id, { name, category });
    toaster.create({ title: "Waypoint updated", type: "success" });
    onClose();
  }

  function handleDelete() {
    if (!waypoint) return;
    deleteWaypoint(waypoint.id);
    toaster.create({ title: "Waypoint deleted", type: "info" });
    onClose();
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
            <Dialog.Title>Edit waypoint</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <IconButton aria-label="Close" variant="ghost" size="sm">
                <XIcon />
              </IconButton>
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap="4">
              {waypoint && (
                <Text color="fg.muted" textStyle="xs">
                  {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)} — drag the marker on the map
                  to move it.
                </Text>
              )}
              <Field.Root>
                <Field.Label>Name (optional)</Field.Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="e.g. Hydration — km 8"
                  autoFocus
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>Category</Field.Label>
                <NativeSelect.Root size="md">
                  <NativeSelect.Field
                    aria-label="Waypoint category"
                    value={category}
                    onChange={(event) =>
                      setCategory(event.currentTarget.value as WaypointCategoryId)
                    }
                  >
                    {WAYPOINT_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <HStack gap="2" textStyle="sm">
                <Box
                  w="2.5"
                  h="2.5"
                  rounded="full"
                  bg={waypointCategory(category).color}
                  flexShrink="0"
                />
                <Text color="fg.muted">
                  Shown as <b>{waypointCategory(category).label}</b>
                  {name.trim() ? ` — “${name.trim()}”` : ""}
                </Text>
              </HStack>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer justifyContent="space-between">
            <Button variant="ghost" colorPalette="red" onClick={handleDelete}>
              Delete
            </Button>
            <HStack gap="2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
