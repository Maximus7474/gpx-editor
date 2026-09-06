import { useMemo, useState } from "react";
import { FilesIcon } from "@phosphor-icons/react";
import {
  Box,
  Button,
  Center,
  createListCollection,
  EmptyState,
  Flex,
  HStack,
  Select,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ImportButton } from "../../components/ImportButton";
import { formatCount } from "../../lib/format";
import { useLibraryStore } from "../../lib/stores/libraryStore";
import type { Project } from "../../lib/types/models";
import { FilesTable } from "./FilesTable";

type LibraryFilter = "all" | "none" | `project:${number}`;

type FilterOption = { label: string; value: LibraryFilter };

const itemTextEllipsis = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const QUICK_OPTIONS: FilterOption[] = [
  { label: "All projects", value: "all" },
  { label: "No project", value: "none" },
];

export function LibraryPage() {
  const files = useLibraryStore((s) => s.files);
  const projects = useLibraryStore((s) => s.projects);
  const loaded = useLibraryStore((s) => s.loaded);
  const loading = useLibraryStore((s) => s.loading);
  const error = useLibraryStore((s) => s.error);
  const load = useLibraryStore((s) => s.load);
  const [filter, setFilter] = useState<LibraryFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return files;
    if (filter === "none") return files.filter((file) => file.projectId === null);
    return files.filter((file) => file.projectId === Number(filter.slice("project:".length)));
  }, [files, filter]);

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
              Library
            </Text>
            <Text color="fg.muted" textStyle="sm">
              {loaded ? formatCount(files.length, "imported GPX file") : "Loading library…"}
            </Text>
          </Box>

          <HStack gap="2">
            <ProjectFilterSelect
              projects={projects}
              filter={filter}
              onFilterChange={setFilter}
            />
            <ImportButton projectId={null} label="Import files" />
          </HStack>
        </Flex>

        {loading && !loaded ? (
          <Center py="16">
            <Spinner />
          </Center>
        ) : error ? (
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Title>Could not load the library</EmptyState.Title>
              <EmptyState.Description>{error}</EmptyState.Description>
              <Box>
                <Button onClick={() => void load()}>Try again</Button>
              </Box>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : files.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <FilesIcon size={36} aria-hidden />
              </EmptyState.Indicator>
              <EmptyState.Title>No GPX files yet</EmptyState.Title>
              <EmptyState.Description>
                Import tracks, routes, and waypoints to build your library.
              </EmptyState.Description>
              <Box>
                <ImportButton projectId={null} label="Import your first file" />
              </Box>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : (
          <FilesTable
            files={filtered}
            emptyMessage={
              filter === "all"
                ? "No files in the library."
                : "No files match this project filter."
            }
          />
        )}
      </Stack>
    </Box>
  );
}

function ProjectFilterSelect({
  projects,
  filter,
  onFilterChange,
}: {
  projects: Project[];
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
}) {
  const collection = useMemo(() => {
    const items: FilterOption[] = [
      ...QUICK_OPTIONS,
      ...projects.map(
        (project): FilterOption => ({
          label: project.name,
          value: `project:${project.id}`,
        }),
      ),
    ];
    return createListCollection({ items });
  }, [projects]);

  return (
    <Select.Root
      size="lg"
      collection={collection}
      value={[filter]}
      onValueChange={(details) => {
        const value = details.value[0];
        if (value) onFilterChange(value as LibraryFilter);
      }}
      width="11rem"
    >
      <Select.Control>
        <Select.Trigger aria-label="Filter files by project">
          <Select.ValueText />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          {QUICK_OPTIONS.map((option) => (
            <Select.Item key={option.value} item={option}>
              <Select.ItemText css={itemTextEllipsis}>{option.label}</Select.ItemText>
            </Select.Item>
          ))}
          {projects.length > 0 && (
            <Box
              aria-hidden
              role="presentation"
              h="1px"
              bg="border"
              mx="3"
              my="1"
              flexShrink="0"
            />
          )}
          {projects.map((project) => {
            const option: FilterOption = { label: project.name, value: `project:${project.id}` };
            return (
              <Select.Item key={option.value} item={option}>
                <Select.ItemText css={itemTextEllipsis}>{option.label}</Select.ItemText>
              </Select.Item>
            );
          })}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  );
}
