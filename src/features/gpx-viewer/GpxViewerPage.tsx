import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Box, Button, Center, Flex, HStack, IconButton, Spinner, Tag, Text } from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { getGpxFile } from "../../lib/db/repository";
import { readGpxFile } from "../../lib/ipc";
import { parseGpx } from "../../lib/gpx/parseGpx";
import { documentBounds } from "../../lib/gpx/geometry";
import { formatCount, formatDate, formatDistance } from "../../lib/format";
import type { GpxDocument } from "../../lib/types/gpx";
import type { GpxFile } from "../../lib/types/models";
import { ElevationPanel } from "./ElevationChart";
import { MapView } from "./MapView";

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; file: GpxFile; doc: GpxDocument };

export function GpxViewerPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const id = Number(fileId);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Shared highlight position (meters along the ordered path) so hovering the
  // map cross-highlights the elevation chart and vice versa. Reset on file load.
  const [hoverDistanceM, setHoverDistanceM] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHoverDistanceM(null);
    setState({ status: "loading" });

    async function load() {
      try {
        const file = await getGpxFile(id);
        if (cancelled) return;
        if (!file) {
          setState({ status: "not-found" });
          return;
        }
        const xml = await readGpxFile(file.filePath);
        const doc = parseGpx(xml);
        if (!cancelled) setState({ status: "ready", file, doc });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const bounds = useMemo(() => {
    if (state.status !== "ready") return null;
    return documentBounds(state.doc);
  }, [state]);

  if (state.status === "loading") {
    return (
      <Center h="full">
        <Spinner />
      </Center>
    );
  }

  if (state.status === "not-found") {
    return (
      <Center h="100vh">
        <Box textAlign="center">
          <Text fontWeight="semibold">File not found</Text>
          <Button mt="3" onClick={() => navigate("/")}>
            Back to library
          </Button>
        </Box>
      </Center>
    );
  }

  if (state.status === "error") {
    return (
      <Center h="100vh">
        <Box textAlign="center" maxW="md">
          <Text fontWeight="semibold">Could not open this file</Text>
          <Text color="fg.muted" textStyle="sm" mt="1">
            {state.message}
          </Text>
          <Button mt="3" onClick={() => navigate("/")}>
            Back to library
          </Button>
        </Box>
      </Center>
    );
  }

  const { file, doc } = state;
  const displayName = doc.metadata.name ?? file.originalName;
  const stats = [
    file.trackCount > 0 ? formatCount(file.trackCount, "track") : null,
    file.routeCount > 0 ? formatCount(file.routeCount, "route") : null,
    file.waypointCount > 0 ? formatCount(file.waypointCount, "waypoint") : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Flex direction="column" h="100vh" bg="bg.muted">
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border.subtle" px={{ base: 4, md: 6 }} py="3" flexShrink="0">
        <HStack gap="3">
          <IconButton
            aria-label="Back to library"
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft />
          </IconButton>
          <Box minW="0" flex="1">
          <Text fontWeight="bold" textStyle="md" lineClamp={1}>
            {displayName}
          </Text>
          <Text color="fg.muted" textStyle="xs" lineClamp={1}>
              {file.originalName} · imported {formatDate(file.importedAt)}
            </Text>
          </Box>
          <HStack gap="2" display={{ base: "none", md: "flex" }} flexShrink="0">
            {stats && <Tag.Root size="sm"><Tag.Label>{stats}</Tag.Label></Tag.Root>}
            {file.distanceM > 0 && (
              <Tag.Root size="sm" colorPalette="green">
                <Tag.Label>{formatDistance(file.distanceM)}</Tag.Label>
              </Tag.Root>
            )}
          </HStack>
        </HStack>
      </Box>

      <Box flex="1" minH="0">
        <MapView
          doc={doc}
          bounds={bounds}
          hoverDistanceM={hoverDistanceM}
          onHoverChange={setHoverDistanceM}
        />
      </Box>

      <ElevationPanel doc={doc} hoverDistanceM={hoverDistanceM} onHoverChange={setHoverDistanceM} />
    </Flex>
  );
}
