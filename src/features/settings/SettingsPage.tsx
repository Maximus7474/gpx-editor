import { Box, Button, Card, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import {
  CheckCircleIcon,
  CloudArrowUpIcon,
  DatabaseIcon,
  DownloadIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useColorMode } from "../../components/ui/color-mode";
import { checkForUpdates, getAppVersion, getLibraryDir, type UpdateStatus } from "../../lib/ipc";
import { useUiStore } from "../../lib/stores/uiStore";

/** Open a URL in the system browser (falls back for browser previews). */
async function openRelease(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

type UpdateState =
  | { kind: "checking" }
  | { kind: "ok"; status: UpdateStatus }
  | { kind: "error"; message: string };

function UpdateStatusView({ status }: { status: UpdateStatus }) {
  if (status.hasUpdate) {
    return (
      <Stack gap="2">
        <HStack gap="2" wrap="wrap">
          <DownloadIcon aria-hidden color="fg.info" />
          <Text textStyle="sm">v{status.latestVersion} is available.</Text>
          <Button size="xs" variant="solid" onClick={() => void openRelease(status.releaseUrl)}>
            View release
          </Button>
        </HStack>
        {status.publishedAt && (
          <Text color="fg.muted" textStyle="xs">
            Published {new Date(status.publishedAt).toLocaleDateString()}
          </Text>
        )}
      </Stack>
    );
  }
  return (
    <HStack gap="2" color="fg.success" textStyle="sm">
      <CheckCircleIcon aria-hidden />
      <Text>You're up to date — v{status.latestVersion} is the latest release.</Text>
    </HStack>
  );
}

export function SettingsPage() {
  const { colorMode, setColorMode } = useColorMode();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const [libraryDir, setLibraryDir] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ kind: "checking" });

  const runCheck = (force: boolean) => {
    setUpdate({ kind: "checking" });
    checkForUpdates(force)
      .then((status) => setUpdate({ kind: "ok", status }))
      .catch((err: unknown) => setUpdate({ kind: "error", message: String(err) }));
  };

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

  // The version comes from the compiled binary, never from a hardcoded
  // constant; the update check runs once here and is cached Rust-side, so
  // re-renders don't re-hit the GitHub API.
  useEffect(() => {
    let cancelled = false;
    getAppVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version);
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null);
      });
    checkForUpdates()
      .then((status) => {
        if (!cancelled) setUpdate({ kind: "ok", status });
      })
      .catch((err: unknown) => {
        if (!cancelled) setUpdate({ kind: "error", message: String(err) });
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
              <PaletteIcon aria-hidden />
              <Card.Title textStyle="md">Appearance</Card.Title>
            </HStack>
          </Card.Header>
          <Card.Body gap="4">
            <HStack gap="2" wrap="wrap">
              <Button
                variant={colorMode === "light" ? "solid" : "outline"}
                onClick={() => setColorMode("light")}
              >
                <SunIcon aria-hidden />
                Light
              </Button>
              <Button
                variant={colorMode === "dark" ? "solid" : "outline"}
                onClick={() => setColorMode("dark")}
              >
                <MoonIcon aria-hidden />
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
              <DatabaseIcon aria-hidden />
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
            <HStack gap="2">
              <CloudArrowUpIcon aria-hidden />
              <Card.Title textStyle="md">Updates</Card.Title>
            </HStack>
          </Card.Header>
          <Card.Body gap="3">
            <HStack gap="2" wrap="wrap">
              <Button
                size="sm"
                variant="outline"
                disabled={update.kind === "checking"}
                onClick={() => runCheck(true)}
              >
                {update.kind === "checking" ? (
                  <Spinner size="sm" />
                ) : (
                  <CloudArrowUpIcon aria-hidden />
                )}
                {update.kind === "checking" ? "Checking…" : "Check for updates"}
              </Button>
              <Text color="fg.muted" textStyle="sm">
                You're on v{appVersion ?? "…"}.
              </Text>
            </HStack>
            {update.kind === "ok" && <UpdateStatusView status={update.status} />}
            {update.kind === "error" && (
              <HStack gap="2" color="fg.error" textStyle="sm">
                <WarningIcon aria-hidden />
                <Text>Couldn't check for updates: {update.message}</Text>
              </HStack>
            )}
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title textStyle="md">About</Card.Title>
          </Card.Header>
          <Card.Body gap="1">
            <Text textStyle="sm">GPX Editor v{appVersion ?? "…"}</Text>
            <Text color="fg.muted" textStyle="sm">
              A local-first library and viewer for GPX tracks, routes, and waypoints.
            </Text>
          </Card.Body>
        </Card.Root>
      </Stack>
    </Box>
  );
}
