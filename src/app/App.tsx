import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { GpxViewerPage } from "../features/gpx-viewer/GpxViewerPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TraceEditorPage } from "../features/trace-editor/TraceEditorPage";
import { AppShell } from "./AppShell";

/**
 * Data router (createHashRouter) so route-aware hooks like `useBlocker`
 * (used by the trace editor's unsaved-changes guard) are available.
 */
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "/projects", element: <ProjectsPage /> },
      { path: "/projects/:projectId", element: <ProjectDetailPage /> },
      { path: "/files/:fileId", element: <GpxViewerPage /> },
      { path: "/trace-editor/:fileId?", element: <TraceEditorPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
