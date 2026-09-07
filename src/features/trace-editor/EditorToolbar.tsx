import { Box, HStack, IconButton } from "@chakra-ui/react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CrosshairIcon,
  CursorIcon,
  ExportIcon,
  FloppyDiskIcon,
  FrameCornersIcon,
  MapPinLineIcon,
  SidebarSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useTraceEditorStore } from "../../lib/stores/traceEditorStore";
import type { EditorTool } from "../../lib/types/trace";

const TOOL_DEFS: { id: EditorTool; label: string; icon: typeof CursorIcon }[] = [
  { id: "select", label: "Select (click a point or waypoint)", icon: CursorIcon },
  { id: "add-point", label: "Add position — click the map", icon: MapPinLineIcon },
  { id: "add-waypoint", label: "Add waypoint — click the map", icon: CrosshairIcon },
];

interface EditorToolbarProps {
  panelOpen: boolean;
  onTogglePanel: () => void;
  onRequestClear: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  canSave: boolean;
  canSaveAs: boolean;
}

/** Top-right tool cluster of the trace editor. */
export function EditorToolbar({
  panelOpen,
  onTogglePanel,
  onRequestClear,
  onSave,
  onSaveAs,
  canSave,
  canSaveAs,
}: EditorToolbarProps) {
  const tool = useTraceEditorStore((s) => s.tool);
  const setTool = useTraceEditorStore((s) => s.setTool);
  const canUndo = useTraceEditorStore((s) => s.past.length > 0);
  const canRedo = useTraceEditorStore((s) => s.future.length > 0);
  const undo = useTraceEditorStore((s) => s.undo);
  const redo = useTraceEditorStore((s) => s.redo);
  const requestFit = useTraceEditorStore((s) => s.requestFit);

  return (
    <HStack gap="1" flexShrink="0" flexWrap="wrap" justify="flex-end">
      {TOOL_DEFS.map(({ id, label, icon: Icon }) => (
        <IconButton
          key={id}
          aria-label={label}
          title={label}
          aria-pressed={tool === id}
          variant={tool === id ? "subtle" : "ghost"}
          size="sm"
          colorPalette={tool === id ? "blue" : "gray"}
          onClick={() => setTool(id)}
        >
          <Icon />
        </IconButton>
      ))}

      <Divider />

      <IconButton
        aria-label="Undo last change"
        title="Undo (last change)"
        variant="ghost"
        size="sm"
        disabled={!canUndo}
        onClick={undo}
      >
        <ArrowCounterClockwiseIcon />
      </IconButton>
      <IconButton
        aria-label="Redo"
        title="Redo"
        variant="ghost"
        size="sm"
        disabled={!canRedo}
        onClick={redo}
      >
        <ArrowClockwiseIcon />
      </IconButton>

      <Divider />

      <IconButton
        aria-label="Zoom to fit the whole trace"
        title="Zoom to fit the trace"
        variant="ghost"
        size="sm"
        disabled={!canSaveAs}
        onClick={requestFit}
      >
        <FrameCornersIcon />
      </IconButton>
      <IconButton
        aria-label="Clear the trace"
        title="Clear the trace"
        variant="ghost"
        size="sm"
        colorPalette="red"
        disabled={!canSaveAs}
        onClick={onRequestClear}
      >
        <TrashIcon />
      </IconButton>

      <Divider />

      <IconButton
        aria-label="Save trace to library"
        title={canSave ? "Save trace to library" : "Nothing new to save"}
        variant="solid"
        size="sm"
        colorPalette="blue"
        disabled={!canSave}
        onClick={onSave}
      >
        <FloppyDiskIcon />
      </IconButton>
      <IconButton
        aria-label="Save a copy of the GPX file"
        title="Save a copy of the GPX file…"
        variant="ghost"
        size="sm"
        disabled={!canSaveAs}
        onClick={onSaveAs}
      >
        <ExportIcon />
      </IconButton>

      <Divider />

      <IconButton
        aria-label={panelOpen ? "Collapse details panel" : "Expand details panel"}
        title={panelOpen ? "Collapse details panel" : "Expand details panel"}
        aria-pressed={panelOpen}
        variant={panelOpen ? "subtle" : "ghost"}
        size="sm"
        onClick={onTogglePanel}
      >
        <SidebarSimpleIcon />
      </IconButton>
    </HStack>
  );
}

function Divider() {
  return <Box w="1px" h="5" bg="border" mx="1" aria-hidden flexShrink="0" />;
}
