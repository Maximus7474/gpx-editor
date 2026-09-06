import { useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FolderSimpleIcon, FolderPlusIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import {
  Box,
  Button,
  Card,
  Center,
  EmptyState,
  Flex,
  HStack,
  IconButton,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { toaster } from "../../components/ui/toaster";
import { formatCount, formatDate } from "../../lib/format";
import { useLibraryStore } from "../../lib/stores/libraryStore";
import type { Project } from "../../lib/types/models";
import { ProjectFormDialog } from "./ProjectFormDialog";

export function ProjectsPage() {
  const projects = useLibraryStore((s) => s.projects);
  const files = useLibraryStore((s) => s.files);
  const loaded = useLibraryStore((s) => s.loaded);
  const loading = useLibraryStore((s) => s.loading);
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const fileCountByProject = useMemo(() => {
    const counts = new Map<number, number>();
    for (const file of files) {
      if (file.projectId !== null) {
        counts.set(file.projectId, (counts.get(file.projectId) ?? 0) + 1);
      }
    }
    return counts;
  }, [files]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openRename(project: Project) {
    setEditing(project);
    setDialogOpen(true);
  }

  async function handleDelete(project: Project) {
    const count = fileCountByProject.get(project.id) ?? 0;
    const ok = await confirm(
      `Delete "${project.name}"? Its ${count === 1 ? "file stays" : `${count} files stay`} in the library, unassigned.`,
      { title: "Delete project", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
    );
    if (!ok) return;
    try {
      await deleteProject(project.id);
      toaster.create({ title: "Project deleted", type: "info" });
    } catch (error) {
      toaster.create({
        title: "Delete failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }

  async function handleSubmit(name: string, description: string) {
    try {
      if (editing) {
        await renameProject(editing.id, name);
        toaster.create({ title: "Project renamed", type: "success" });
      } else {
        const project = await createProject(name, description);
        toaster.create({ title: `Created "${project.name}"`, type: "success" });
      }
    } catch (error) {
      toaster.create({
        title: editing ? "Rename failed" : "Could not create project",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      throw error;
    }
  }

  const deleteProject = useLibraryStore((s) => s.deleteProject);
  const createProject = useLibraryStore((s) => s.createProject);
  const renameProject = useLibraryStore((s) => s.renameProject);

  return (
    <Box maxW="8xl" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
      <Stack gap="5">
        <Flex
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          gap="3"
          wrap="wrap"
        >
          <Box>
            <Text textStyle="xl" fontWeight="bold">
              Projects
            </Text>
            <Text color="fg.muted" textStyle="sm">
              {loaded ? formatCount(projects.length, "event project") : "Loading projects…"}
            </Text>
          </Box>
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New project
          </Button>
        </Flex>

        {loading && !loaded ? (
          <Center py="16">
            <Spinner />
          </Center>
        ) : projects.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <FolderSimpleIcon size={36} aria-hidden />
              </EmptyState.Indicator>
              <EmptyState.Title>No projects yet</EmptyState.Title>
              <EmptyState.Description>
                Group GPX files into projects — one project per event or route set.
              </EmptyState.Description>
              <Button onClick={openCreate}>
                <FolderPlusIcon aria-hidden />
                Create your first project
              </Button>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                fileCount={fileCountByProject.get(project.id) ?? 0}
                onOpen={() => navigate(`/projects/${project.id}`)}
                onRename={() => openRename(project)}
                onDelete={() => void handleDelete(project)}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <ProjectFormDialog
        open={dialogOpen}
        project={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}

interface ProjectCardProps {
  project: Project;
  fileCount: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, fileCount, onOpen, onRename, onDelete }: ProjectCardProps) {
  return (
    <Card.Root
      variant="elevated"
      _hover={{ borderColor: "border.muted" }}
      cursor="pointer"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open project ${project.name}`}
    >
      <Card.Header pb="2">
        <Flex justify="space-between" align="flex-start" gap="2">
          <Box minW="0">
            <Card.Title textStyle="md" lineClamp={1}>
              {project.name}
            </Card.Title>
            {project.description ? (
              <Card.Description lineClamp={2} mt="1">
                {project.description}
              </Card.Description>
            ) : null}
          </Box>
          <HStack gap="0" flexShrink="0">
            <IconButton
              aria-label={`Rename ${project.name}`}
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onRename();
              }}
            >
              <PencilSimpleIcon />
            </IconButton>
            <IconButton
              aria-label={`Delete ${project.name}`}
              variant="ghost"
              size="sm"
              colorPalette="red"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <TrashIcon />
            </IconButton>
          </HStack>
        </Flex>
      </Card.Header>
      <Card.Body pt="1">
        <Text color="fg.muted" textStyle="sm">
          {formatCount(fileCount, "file")} · updated {formatDate(project.updatedAt)}
        </Text>
      </Card.Body>
    </Card.Root>
  );
}
