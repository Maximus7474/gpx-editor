import { Box, Button, Center, Dialog, Flex, HStack, IconButton, Tag, Text } from "@chakra-ui/react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toaster } from "../../components/ui/toaster";
import { insertGpxFileRow, updateGpxFileMetadata } from "../../lib/db/repository";
import { formatDistance } from "../../lib/format";
import { elevationProfile } from "../../lib/gpx/profile";
import { serializeGpxDocument, traceToGpxDocument } from "../../lib/gpx/serializeGpx";
import { saveTraceToLibrary } from "../../lib/ipc";
import { useLibraryStore } from "../../lib/stores/libraryStore";
import {
  type SavedTraceFile,
  traceLengthM,
  useTraceEditorStore,
} from "../../lib/stores/traceEditorStore";
import type { ImportedGpx } from "../../lib/types/models";
import type { EditorTool } from "../../lib/types/trace";
import { DetailsPanel } from "./DetailsPanel";
import { EditorMap } from "./EditorMap";
import { EditorToolbar } from "./EditorToolbar";
import { SaveTraceDialog } from "./SaveTraceDialog";
import { TraceElevationPanel } from "./TraceElevationPanel";
import { WaypointDialog } from "./WaypointDialog";

/**
 * Trace creator/editor workspace (Phase 2, milestone 1). The session is
 * in-memory: positions are laid by clicking the map, waypoints (checkpoints,
 * hydration stations…) can be dropped, dragged, renamed and recategorized,
 * and every change is undoable. Nothing is persisted yet — serialization and
 * saving to the library come in the next milestone.
 */
export function TraceEditorPage() {
  const navigate = useNavigate();
  const points = useTraceEditorStore((s) => s.points);
  const waypoints = useTraceEditorStore((s) => s.waypoints);
  const tool = useTraceEditorStore((s) => s.tool);
  const discard = useTraceEditorStore((s) => s.discard);
  const savedFile = useTraceEditorStore((s) => s.savedFile);
  const saved = useTraceEditorStore((s) => s.saved);
  const markSaved = useTraceEditorStore((s) => s.markSaved);
  const elevationLoading = useTraceEditorStore((s) => s.elevationLoading);

  const hasContent = points.length > 0 || waypoints.length > 0;
  const unsaved = hasContent && !saved;
  const [clearOpen, setClearOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  // Open the details panel on roomy windows, keep it collapsed on narrow ones
  // so the map (and the drawing surface) keeps the space.
  const [panelOpen, setPanelOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1100px)").matches;
  });
  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null);

  const editingWaypoint = useTraceEditorStore((s) =>
    editingWaypointId === null
      ? null
      : (s.waypoints.find((w) => w.id === editingWaypointId) ?? null),
  );

  const distanceM = useMemo(() => traceLengthM(points), [points]);

  // The editor's live document + elevation profile (recomputed on every change).
  const editorDoc = useMemo(
    () => traceToGpxDocument(savedFile?.name ?? "New trace", points, waypoints),
    [points, waypoints, savedFile],
  );
  const profile = useMemo(() => elevationProfile(editorDoc), [editorDoc]);

  const headerStats = [
    points.length > 0 ? `${points.length} positions` : null,
    distanceM > 0 ? formatDistance(distanceM) : null,
    waypoints.length > 0
      ? `${waypoints.length} waypoint${waypoints.length === 1 ? "" : "s"}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  function handleClear() {
    discard();
    setClearOpen(false);
    toaster.create({ title: "Trace cleared", type: "info" });
  }

  async function handleSaveTrace(name: string, projectId: number | null) {
    try {
      const xml = serializeGpxDocument(traceToGpxDocument(name, points, waypoints));
      const written = await saveTraceToLibrary(xml, name, savedFile?.filePath);
      const row: ImportedGpx = { ...written, name };
      let file: SavedTraceFile;
      if (savedFile) {
        const updated = await updateGpxFileMetadata(savedFile.id, row, name);
        useLibraryStore.getState().updateFile(updated);
        file = {
          id: updated.id,
          filePath: updated.filePath,
          originalName: updated.originalName,
          name,
        };
      } else {
        const created = await insertGpxFileRow(row, projectId);
        useLibraryStore.getState().addFile(created);
        file = {
          id: created.id,
          filePath: created.filePath,
          originalName: created.originalName,
          name,
        };
      }
      markSaved(file);
      toaster.create({
        title: savedFile ? "Trace updated in library" : "Trace saved to library",
        description: name,
        type: "success",
      });
    } catch (error) {
      toaster.create({
        title: "Save failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      throw error;
    }
  }

  async function handleSaveCopy(name: string, projectId: number | null) {
    try {
      const xml = serializeGpxDocument(traceToGpxDocument(name, points, waypoints));
      const written = await saveTraceToLibrary(xml, name);
      const created = await insertGpxFileRow({ ...written, name }, projectId);
      useLibraryStore.getState().addFile(created);
      toaster.create({ title: "Copy saved to library", description: name, type: "success" });
    } catch (error) {
      toaster.create({
        title: "Save failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      throw error;
    }
  }

  return (
    <Flex direction="column" h="100vh" bg="bg.muted">
      {/* Header: back nav + title on the left, tools on the right. */}
      <Box
        bg="bg.panel"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        px={{ base: 3, md: 5 }}
        py="2.5"
        flexShrink="0"
      >
        <HStack gap="3" flexWrap="wrap">
          <IconButton aria-label="Back" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeftIcon />
          </IconButton>
          <Box minW="0" flex="1">
            <HStack gap="2">
              <Text fontWeight="bold" textStyle="md" lineClamp={1}>
                {savedFile ? savedFile.name : "New trace"}
              </Text>
              {unsaved && (
                <Tag.Root size="sm" colorPalette="orange">
                  <Tag.Label>Unsaved</Tag.Label>
                </Tag.Root>
              )}
            </HStack>
            {headerStats ? (
              <Text color="fg.muted" textStyle="xs" lineClamp={1}>
                {headerStats}
              </Text>
            ) : (
              <Text color="fg.muted" textStyle="xs" lineClamp={1}>
                Click the map to lay out the course.
              </Text>
            )}
          </Box>
          <EditorToolbar
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((open) => !open)}
            onRequestClear={() => setClearOpen(true)}
            onSave={() => setSaveOpen(true)}
            onSaveAs={() => setCopyOpen(true)}
            canSave={unsaved}
            canSaveAs={hasContent}
          />
        </HStack>
      </Box>

      {/* Workspace: map + collapsible right-hand details panel. */}
      <Flex flex="1" minH="0">
        <Box position="relative" flex="1" minW="0">
          <EditorMap onEditWaypoint={setEditingWaypointId} />

          {/* Empty-state hint — pointer-events none so the map keeps clicks. */}
          {points.length === 0 && (
            <Center position="absolute" inset="0" zIndex="1000" pointerEvents="none">
              <Box
                bg="bg.panel"
                px="4"
                py="3"
                rounded="lg"
                shadow="md"
                borderWidth="1px"
                borderColor="border.subtle"
                textAlign="center"
                maxW="xs"
              >
                <Text fontWeight="semibold" textStyle="sm">
                  {tool === "add-point"
                    ? "Click the map to place your first position"
                    : "Click the map to drop a waypoint"}
                </Text>
                <Text color="fg.muted" textStyle="xs" mt="0.5">
                  Switch tools in the top-right corner — everything here is undoable.
                </Text>
              </Box>
            </Center>
          )}

          {/* Live hint for the active tool. */}
          {points.length > 0 && (
            <Box
              position="absolute"
              bottom="3"
              left="50%"
              transform="translateX(-50%)"
              zIndex="1000"
              pointerEvents="none"
            >
              <Text
                bg="bg.panel"
                px="3"
                py="1"
                rounded="full"
                shadow="sm"
                borderWidth="1px"
                borderColor="border.subtle"
                textStyle="xs"
                color="fg.muted"
              >
                {toolHint(tool)}
              </Text>
            </Box>
          )}
        </Box>

        <DetailsPanel
          open={panelOpen}
          onToggle={() => setPanelOpen((open) => !open)}
          onEditWaypoint={setEditingWaypointId}
        />
      </Flex>

      <TraceElevationPanel
        profile={profile}
        points={points}
        waypoints={waypoints}
        loading={elevationLoading}
      />

      <WaypointDialog waypoint={editingWaypoint} onClose={() => setEditingWaypointId(null)} />

      <SaveTraceDialog
        open={saveOpen}
        defaultName={savedFile?.name ?? "New trace"}
        allowProject={!savedFile}
        onClose={() => setSaveOpen(false)}
        onSave={handleSaveTrace}
      />

      <SaveTraceDialog
        open={copyOpen}
        defaultName={savedFile ? `${savedFile.name} copy` : "New trace"}
        allowProject
        onClose={() => setCopyOpen(false)}
        onSave={handleSaveCopy}
      />

      {/* Clear-confirmation dialog */}
      <Dialog.Root
        open={clearOpen}
        onOpenChange={(details) => {
          if (!details.open) setClearOpen(false);
        }}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Clear the trace?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text textStyle="sm">
                This removes all {points.length} position{points.length === 1 ? "" : "s"} and{" "}
                {waypoints.length} waypoint{waypoints.length === 1 ? "" : "s"} from the workspace.
                You can undo right after if it was a mistake.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="ghost" onClick={() => setClearOpen(false)}>
                Cancel
              </Button>
              <Button colorPalette="red" onClick={handleClear}>
                Clear trace
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Flex>
  );
}

function toolHint(tool: EditorTool): string {
  switch (tool) {
    case "add-point":
      return "Click to add a position · drag the map to move around";
    case "add-waypoint":
      return "Click to drop a waypoint — drag or double-click it afterwards";
    case "select":
      return "Click a point or waypoint to select it; double-click a waypoint to edit";
  }
}
