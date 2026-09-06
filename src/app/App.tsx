import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { GpxViewerPage } from "../features/gpx-viewer/GpxViewerPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TraceEditorPage } from "../features/trace-editor/TraceEditorPage";
import { AppShell } from "./AppShell";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LibraryPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/files/:fileId" element={<GpxViewerPage />} />
          <Route path="/trace-editor" element={<TraceEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
