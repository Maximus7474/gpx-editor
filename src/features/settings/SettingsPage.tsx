import { useEffect, useState } from "react";
import { Database, Moon, Palette, Sun } from "@phosphor-icons/react";
import { Box, Button, Card, HStack, Stack, Text } from "@chakra-ui/react";
import { useColorMode } from "../../components/ui/color-mode";
import { getLibraryDir } from "../../lib/ipc";
import { useUiStore } from "../../lib/stores/uiStore";

const APP_VERSION = "0.1.0";

export function SettingsPage() {
  const { colorMode, setColorMode } = useColorMode();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const [libraryDir, setLibraryDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLibraryDir()
      .then((path) => {
        if (!cancelled) setLibraryDir(path);
      })
      .catch(() => {
        if (!cancelled) setLibraryDir(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box maxW="4xl" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
      <Stack gap="6">
        <Box>
          <Text textStyle="xl" fontWeight="bold">
            Settings
          </Text>
          <Text color="fg.muted" textStyle="sm">
            Appearance, storage, and app information.
          </Text>
        </Box>

        <Card.Root>
          <Card.Header>
            <HStack gap="2">
              <Palette aria-hidden />
              <Card.Title textStyle="md">Appearance</Card.Title>
            </HStack>
          </Card.Header>
          <Card.Body gap="4">
            <HStack gap="2" wrap="wrap">
              <Button
                variant={colorMode === "light" ? "solid" : "outline"}
                onClick={() => setColorMode("light")}
              >
                <Sun aria-hidden />
                Light
              </Button>
              <Button
                variant={colorMode === "dark" ? "solid" : "outline"}
                onClick={() => setColorMode("dark")}
              >
                <Moon aria-hidden />
                Dark
              </Button>
            </HStack>
            <Text color="fg.muted" textStyle="sm">
              The sidebar is currently {sidebarCollapsed ? "collapsed" : "expanded"}; its state is
              remembered between sessions.
            </Text>
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <HStack gap="2">
              <Database aria-hidden />
              <Card.Title textStyle="md">Storage</Card.Title>
            </HStack>
          </Card.Header>
          <Card.Body gap="2">
            <Text color="fg.muted" textStyle="sm">
              Imported GPX files are copied into a managed library folder; your originals are never
              modified.
            </Text>
            <Text textStyle="sm" fontFamily="mono" fontSize="xs" wordBreak="break-all">
              {libraryDir ?? "Loading…"}
            </Text>
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title textStyle="md">About</Card.Title>
          </Card.Header>
          <Card.Body gap="1">
            <Text textStyle="sm">GPX Editor v{APP_VERSION}</Text>
            <Text color="fg.muted" textStyle="sm">
              A local-first library and viewer for GPX tracks, routes, and waypoints.
            </Text>
          </Card.Body>
        </Card.Root>
      </Stack>
    </Box>
  );
}
