import { Box, Button, Flex, IconButton, Text, VStack } from "@chakra-ui/react";
import {
  CaretLineLeftIcon,
  CaretLineRightIcon,
  FolderSimpleIcon,
  GearIcon,
  MapTrifoldIcon,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUiStore } from "../lib/stores/uiStore";

interface NavItem {
  label: string;
  to: string;
  icon: typeof MapTrifoldIcon;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Library", to: "/", icon: MapTrifoldIcon, exact: true },
  { label: "Projects", to: "/projects", icon: FolderSimpleIcon },
];

const SETTINGS: NavItem = { label: "Settings", to: "/settings", icon: GearIcon, exact: true };

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  return (
    <Flex
      as="nav"
      direction="column"
      h="100vh"
      flexShrink="0"
      w={collapsed ? "16" : "60"}
      bg="bg.panel"
      borderRightWidth="1px"
      borderColor="border.subtle"
      transition="width 0.18s ease"
      overflow="hidden"
    >
      {/* Brand row — becomes a lone toggle in collapsed mode. */}
      <Flex
        align="center"
        justify={collapsed ? "center" : "space-between"}
        gap="2"
        px="3"
        h="14"
        flexShrink="0"
      >
        {!collapsed && (
          <Flex align="center" gap="2" minW="0">
            <MapTrifoldIcon size={20} aria-hidden />
            <Text fontWeight="bold" textStyle="sm" whiteSpace="nowrap">
              GPX Editor
            </Text>
          </Flex>
        )}
        <IconButton
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <CaretLineRightIcon /> : <CaretLineLeftIcon />}
        </IconButton>
      </Flex>

      <VStack
        as="ul"
        gap="1"
        px="2"
        mt="2"
        mb="2"
        flex="1"
        minH="0"
        align="stretch"
        overflowY="auto"
      >
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
        ))}
        <SidebarNavItem item={SETTINGS} collapsed={collapsed} pinned />
      </VStack>
    </Flex>
  );
}

function SidebarNavItem({
  item,
  collapsed,
  pinned = false,
}: {
  item: NavItem;
  collapsed: boolean;
  pinned?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  return (
    <Box as="li" listStyleType="none" w="full" mt={pinned ? "auto" : undefined}>
      {pinned && !collapsed && <Box aria-hidden h="1px" bg="border" mx="1" mb="2" flexShrink="0" />}
      <Button
        variant={active ? "subtle" : "ghost"}
        w="full"
        justifyContent={collapsed ? "center" : "flex-start"}
        gap="2"
        px="2"
        colorPalette="gray"
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={() => navigate(item.to)}
      >
        <item.icon size={19} aria-hidden />
        {!collapsed && (
          <Text as="span" fontWeight="medium">
            {item.label}
          </Text>
        )}
      </Button>
    </Box>
  );
}
