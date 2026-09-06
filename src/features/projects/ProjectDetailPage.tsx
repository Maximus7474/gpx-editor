import {
  Box,
  Button,
  Card,
  Center,
  EmptyState,
  Flex,
  HStack,
  IconButton,
  NativeSelect,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ArrowLeftIcon, FolderPlusIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ImportButton } from "../../components/ImportButton";
import { toaster } from "../../components/ui/toaster";
import { formatCount } from "../../lib/format";
import { useLibraryStore } from "../../lib/stores/libraryStore";
import { FilesTable } from "../library/FilesTable";
import { ProjectFormDialog } from "./ProjectFormDialog";

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const id = Number(projectId);

  const projects = useLibraryStore((s) => s.projects);
  const files = useLibraryStore((s) => s.files);
  const loaded = useLibraryStore((s) => s.loaded);
  const loading = useLibraryStore((s) => s.loading);
  const assignFile = useLibraryStore((s) => s.assignFile);
  const renameProject = useLibraryStore((s) => s.renameProject);
  const deleteProject = useLibraryStore((s) => s.deleteProject);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const project = useMemo(
    () => projects.find((candidate) => candidate.id === id) ?? null,
    [projects, id],
  );

  const projectFiles = useMemo(() => files.filter((file) => file.projectId === id), [files, id]);
  const unassignedFiles = useMemo(() => files.filter((file) => file.projectId === null), [files]);

  if (loading && !loaded) {
    return (
      <Center h="full">
        <Spinner />
      </Center>
    );
  }

  if (!project) {
    return (
      <Center h="full">
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Title>Project not found</EmptyState.Title>
            <Button onClick={() => navigate("/projects")}>Back to projects</Button>
          </EmptyState.Content>
        </EmptyState.Root>
      </Center>
    );
  }

  // Handlers below are hoisted function declarations, so TypeScript does not
  // retain the null-narrowing from the guard above inside them.
  const activeProject = project;

  async function handleRenameSubmit(name: string, _description: string) {
    try {
      await renameProject(activeProject.id, name);
      toaster.create({ title: "Project renamed", type: "success" });
    } catch (error) {
      toaster.create({
        title: "Rename failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      throw error;
    }
  }

  async function handleDelete() {
    const ok = await confirm(
      `Delete "${activeProject.name}"? Its files stay in the library, unassigned.`,
      { title: "Delete project", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
    );
    if (!ok) return;
    try {
      await deleteProject(activeProject.id);
      navigate("/projects");
      toaster.create({ title: "Project deleted", type: "info" });
    } catch (error) {
      toaster.create({
        title: "Delete failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }

  async function handleAssign(fileId: number) {
    setAssigning(true);
    try {
      await assignFile(fileId, activeProject.id);
    } catch (error) {
      toaster.create({
        title: "Could not add file",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Box maxW="8xl" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
      <Stack gap="5">
        <HStack gap="1" flexShrink="0">
          <IconButton
            aria-label="Back to projects"
            variant="ghost"
            size="sm"
            onClick={() => navigate("/projects")}
          >
            <ArrowLeftIcon />
          </IconButton>
          <Text color="fg.muted" textStyle="sm">
            Projects
          </Text>
        </HStack>

        <Flex
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "flex-start" }}
          gap="3"
          wrap="wrap"
        >
          <Box minW="0">
            <HStack gap="2">
              <Text textStyle="xl" fontWeight="bold" lineClamp={1}>
                {activeProject.name}
              </Text>
              <IconButton
                aria-label={`Rename ${project.name}`}
                variant="ghost"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                <PencilSimpleIcon />
              </IconButton>
              <IconButton
                aria-label={`Delete ${project.name}`}
                variant="ghost"
                size="sm"
                colorPalette="red"
                onClick={() => void handleDelete()}
              >
                <TrashIcon />
              </IconButton>
            </HStack>
            {project.description ? (
              <Text color="fg.muted" textStyle="sm" mt="1">
                {project.description}
              </Text>
            ) : null}
            <Text color="fg.muted" textStyle="sm" mt="1">
              {formatCount(projectFiles.length, "file")} in this project
            </Text>
          </Box>

          <ImportButton projectId={project.id} label="Import into project" alignSelf="flex-start" />
        </Flex>

        <FilesTable
          files={projectFiles}
          emptyMessage="No files in this project yet — import GPX files here or add files below."
        />

        <Card.Root>
          <Card.Header>
            <Card.Title textStyle="md">Add files from the library</Card.Title>
          </Card.Header>
          <Card.Body pt="0">
            {unassignedFiles.length === 0 ? (
              <Text color="fg.muted" textStyle="sm">
                No unassigned files available. Files already in another project can be moved from
                its row in the table above.
              </Text>
            ) : (
              <NativeSelect.Root maxW="sm" disabled={assigning}>
                <NativeSelect.Field
                  aria-label="Add an unassigned file to this project"
                  value=""
                  onChange={(event) => {
                    const fileId = Number(event.currentTarget.value);
                    if (fileId) void handleAssign(fileId);
                  }}
                >
                  <option value="">Choose a file to add…</option>
                  {unassignedFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.originalName}
                    </option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
            )}
            {unassignedFiles.length > 0 && (
              <Text color="fg.muted" textStyle="xs" mt="2">
                <FolderPlusIcon aria-hidden /> Selecting a file assigns it to this project.
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      </Stack>

      <ProjectFormDialog
        open={dialogOpen}
        project={project}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleRenameSubmit}
      />
    </Box>
  );
}
