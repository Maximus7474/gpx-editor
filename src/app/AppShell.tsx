import { Box, Flex } from "@chakra-ui/react";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useLibraryStore } from "../lib/stores/libraryStore";
import { useUiStore } from "../lib/stores/uiStore";
import { Sidebar } from "./Sidebar";

/**
 * Persistent shell: collapsible sidebar + routed content. Page sections own
 * their own vertical layout so the map viewer can fill available height.
 */
export function AppShell() {
  const loadPreferences = useUiStore((s) => s.loadPreferences);
  const loadLibrary = useLibraryStore((s) => s.load);

  useEffect(() => {
    void loadPreferences();
    void loadLibrary();
  }, [loadPreferences, loadLibrary]);

  return (
    <Flex h="100vh" overflow="hidden">
      <Sidebar />
      <Box as="main" flex="1" minW="0" h="100vh" overflowY="auto" bg="bg.muted">
        <Outlet />
      </Box>
    </Flex>
  );
}
