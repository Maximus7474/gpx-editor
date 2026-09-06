import { useMemo, useState } from "react";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { Export, Eye, Trash } from "@phosphor-icons/react";
import { Box, HStack, IconButton, NativeSelect, Table, Text } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { toaster } from "../../components/ui/toaster";
import { exportGpxFile } from "../../lib/ipc";
import { formatCount, formatDate, formatDistance } from "../../lib/format";
import { useLibraryStore } from "../../lib/stores/libraryStore";
import type { GpxFile } from "../../lib/types/models";

const GPX_FILTERS = [{ name: "GPX files", extensions: ["gpx"] }];

interface FilesTableProps {
  files: GpxFile[];
  /** Shown when `files` is empty. */
  emptyMessage: string;
}

export function FilesTable({ files, emptyMessage }: FilesTableProps) {
  if (files.length === 0) {
    return (
      <Text color="fg.muted" textStyle="sm" px="1" py="2">
        {emptyMessage}
      </Text>
    );
  }

  return (
    <Box overflowX="auto">
      <Table.Root size="sm" striped>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>File</Table.ColumnHeader>
            <Table.ColumnHeader>Project</Table.ColumnHeader>
            <Table.ColumnHeader>Contents</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Distance</Table.ColumnHeader>
            <Table.ColumnHeader>Imported</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function FileRow({ file }: { file: GpxFile }) {
  const projects = useLibraryStore((s) => s.projects);
  const assignFile = useLibraryStore((s) => s.assignFile);
  const deleteFile = useLibraryStore((s) => s.deleteFile);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const parts: string[] = [];
    if (file.trackCount > 0) parts.push(formatCount(file.trackCount, "track"));
    if (file.routeCount > 0) parts.push(formatCount(file.routeCount, "route"));
    if (file.waypointCount > 0) parts.push(formatCount(file.waypointCount, "waypoint"));
    return parts.length > 0 ? parts.join(" · ") : "No data";
  }, [file]);

  async function handleAssign(projectId: number | null) {
    try {
      await assignFile(file.id, projectId);
    } catch (error) {
      toaster.create({
        title: "Could not update project",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }

  async function handleExport() {
    const destPath = await save({
      title: "Export GPX file",
      defaultPath: file.originalName,
      filters: GPX_FILTERS,
    });
    if (!destPath) return;
    setBusy(true);
    try {
      await exportGpxFile(file.filePath, destPath);
      toaster.create({ title: "File exported", description: destPath, type: "success" });
    } catch (error) {
      toaster.create({
        title: "Export failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm(
      `Remove "${file.originalName}" from the library? The imported copy on disk is deleted; the original file is untouched.`,
      { title: "Delete file", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
    );
    if (!ok) return;
    try {
      await deleteFile(file);
      toaster.create({ title: "File deleted", type: "info" });
    } catch (error) {
      toaster.create({
        title: "Delete failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }

  return (
    <Table.Row>
      <Table.Cell>
        <Text fontWeight="medium" lineClamp={1} title={file.originalName}>
          {file.originalName}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <NativeSelect.Root size="xs" minW="8rem" maxW="12rem">
          <NativeSelect.Field
            aria-label={`Move "${file.originalName}" to a project`}
            value={file.projectId === null ? "" : String(file.projectId)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              void handleAssign(value === "" ? null : Number(value));
            }}
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Table.Cell>
      <Table.Cell>
        <Text color="fg.muted" textStyle="xs" lineClamp={1}>
          {stats}
        </Text>
      </Table.Cell>
      <Table.Cell textAlign="right">
        <Text textStyle="sm">{formatDistance(file.distanceM)}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text color="fg.muted" textStyle="sm">
          {formatDate(file.importedAt)}
        </Text>
      </Table.Cell>
      <Table.Cell textAlign="right">
        <HStack gap="1" justify="flex-end">
          <IconButton
            aria-label={`View ${file.originalName}`}
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/files/${file.id}`)}
          >
            <Eye />
          </IconButton>
          <IconButton
            aria-label={`Export ${file.originalName}`}
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void handleExport()}
          >
            <Export />
          </IconButton>
          <IconButton
            aria-label={`Delete ${file.originalName}`}
            variant="ghost"
            size="sm"
            colorPalette="red"
            onClick={() => void handleDelete()}
          >
            <Trash />
          </IconButton>
        </HStack>
      </Table.Cell>
    </Table.Row>
  );
}
