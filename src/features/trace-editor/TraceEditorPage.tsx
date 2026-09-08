import {
  Box,
  Button,
  Center,
  Dialog,
  Flex,
  HStack,
  IconButton,
  Spinner,
  Tag,
  Text,
} from "@chakra-ui/react";
import { ArrowLeftIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
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
import type { GpxDocument } from "../../lib/types/gpx";
import type { ImportedGpx } from "../../lib/types/models";
import type { EditorTool } from "../../lib/types/trace";
import { DetailsPanel } from "./DetailsPanel";
import { EditorMap } from "./EditorMap";
import { EditorToolbar } from "./EditorToolbar";
import { SaveTraceDialog } from "./SaveTraceDialog";
import { TraceElevationPanel } from "./TraceElevationPanel";
import { WaypointDialog } from "./WaypointDialog";

/**
 * Trace creator/editor workspace. The session is in-memory:
 * positions are laid by clicking the map, waypoints (checkpoints, hydration
 * stations…) can be dropped, dragged, renamed and recategorized, and every
 * change is undoable. `/trace-editor/:fileId` loads a library GPX for in-place
 * editing; saving serializes the session back to GPX in the managed library.
 * Leaving the workspace discards the session, so the editor always re-opens
 * as a blank project.
 */
export function TraceEditorPage() {
  const navigate = useNavigate();
  const { fileId } = useParams();
  // No param → a fresh workspace; a numeric param → edit that library file.
  const fileIdNum = fileId === undefined ? null : Number(fileId);
  const loadTrace = useTraceEditorStore((s) => s.loadTrace);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Shown when the loaded file has structure the editor cannot round-trip
  // (multiple tracks merged, routes dropped) so the user isn't surprised on save.
  const [consolidationWarning, setConsolidationWarning] = useState<string | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
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

  // ---- Unsaved-changes guard -------------------------------------------------
  // Block leaving the workspace (sidebar, back button, direct nav) while there
  // are unsaved edits; a confirm dialog lets the user stay or discard. Window
  // close is covered separately via `beforeunload`.
  // Set when a real navigation away from the workspace starts (the blocker
  // callback runs on every attempt, even ones it lets through). The unmount
  // cleanup below then discards the session, so re-entering the trace editor
  // always offers a blank project. StrictMode's dev-only remount never sets it.
  const leavingRef = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname !== nextLocation.pathname) {
      leavingRef.current = true;
    }
    return unsaved && currentLocation.pathname !== nextLocation.pathname;
  });
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    if (blocker.state === "blocked") setLeaveOpen(true);
  }, [blocker.state]);

  // Leaving the editor clears the in-memory session (loaded trace, drawn
  // points, history) so the next visit starts from a blank workspace.
  useEffect(() => {
    return () => {
      if (leavingRef.current) discard();
    };
  }, [discard]);

  useEffect(() => {
    if (!unsaved) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  function handleStay() {
    setLeaveOpen(false);
    if (blocker.state === "blocked") blocker.reset();
  }

  function handleLeave() {
    setLeaveOpen(false);
    if (blocker.state === "blocked") blocker.proceed();
  }

  useEffect(() => {
    if (fileIdNum === null) {
      // The blank editor route always starts from a blank project — clear any
      // loaded/unsaved session. This also covers the sidebar "Trace editor"
      // click while editing a file, which changes the param without unmounting.
      discard();
      setLoadState("idle");
      setConsolidationWarning(null);
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);
    loadTrace(fileIdNum)
      .then((doc) => {
        if (cancelled) return;
        setConsolidationWarning(doc ? consolidationNote(doc) : null);
        setWarningDismissed(false);
        setLoadState("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [fileIdNum, loadTrace, discard]);

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

  if (loadState === "loading") {
    return (
      <Center h="100vh">
        <Spinner />
      </Center>
    );
  }

  if (loadState === "error") {
    return (
      <Center h="100vh">
        <Box textAlign="center" maxW="md">
          <Text fontWeight="semibold">Could not open this file for editing</Text>
          <Text color="fg.muted" textStyle="sm" mt="1">
            {loadError}
          </Text>
          <Button mt="3" onClick={() => navigate("/")}>
            Back to library
          </Button>
        </Box>
      </Center>
    );
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

      {/* Data-integrity note for loaded files the editor cannot round-trip. */}
      {consolidationWarning && !warningDismissed && (
        <HStack
          gap="2"
          px={{ base: 3, md: 5 }}
          py="1.5"
          bg="bg.panel"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          flexShrink="0"
        >
          <WarningCircleIcon color="#d97706" />
          <Text color="fg.muted" textStyle="xs" flex="1">
            {consolidationWarning}
          </Text>
          <IconButton
            aria-label="Dismiss warning"
            variant="ghost"
            size="xs"
            onClick={() => setWarningDismissed(true)}
          >
            <XIcon />
          </IconButton>
        </HStack>
      )}

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
      {/* Unsaved-changes dialog (navigation was blocked). */}
      <Dialog.Root
        open={leaveOpen}
        onOpenChange={(details) => {
          // Closing via ESC/backdrop means "stay" — cancel the blocked navigation.
          if (!details.open) handleStay();
        }}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Unsaved changes</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text textStyle="sm">
                This trace has unsaved changes. If you leave the editor now, they will be lost.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="ghost" onClick={handleStay}>
                Keep editing
              </Button>
              <Button colorPalette="red" onClick={handleLeave}>
                Discard &amp; leave
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

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

/**
 * Explain what saving will do to a loaded file's structure when the editor
 * cannot faithfully round-trip it: multiple tracks merge into one, and routes
 * are dropped (or only the first is used when there are no tracks). Null when
 * the file edits cleanly.
 */
function consolidationNote(doc: GpxDocument): string | null {
  const notes: string[] = [];
  if (doc.tracks.length > 1) {
    notes.push(`${doc.tracks.length} tracks will be merged into one`);
  }
  if (doc.tracks.length > 0 && doc.routes.length > 0) {
    notes.push(`${doc.routes.length} route${doc.routes.length === 1 ? "" : "s"} won't be saved`);
  }
  if (doc.tracks.length === 0 && doc.routes.length > 1) {
    notes.push(`only the first of ${doc.routes.length} routes is edited`);
  }
  if (notes.length === 0) return null;
  return `Editing this file: ${notes.join("; ")}.`;
}
