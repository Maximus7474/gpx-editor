import { create } from "zustand";
import * as repo from "../db/repository";
import { importGpxFiles as importViaRust, removeLibraryFile } from "../ipc";
import type { GpxFile, ImportResult, Project } from "../types/models";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface LibraryState {
  projects: Project[];
  files: GpxFile[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Load projects + files from SQLite (called once at app start). */
  load: () => Promise<void>;
  /** Copy via Rust, insert rows via SQLite, then refresh the file list. */
  importFiles: (sourcePaths: string[], projectId: number | null) => Promise<ImportResult>;
  deleteFile: (file: GpxFile) => Promise<void>;
  renameFile: (fileId: number, name: string) => Promise<void>;
  assignFile: (fileId: number, projectId: number | null) => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project>;
  renameProject: (id: number, name: string) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  /** Insert a freshly saved trace into the in-memory list (front of list). */
  addFile: (file: GpxFile) => void;
  /** Replace a file entry after its metadata/name changed (in-editor re-save). */
  updateFile: (file: GpxFile) => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  projects: [],
  files: [],
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const [projects, files] = await Promise.all([repo.listProjects(), repo.listGpxFiles()]);
      set({ projects, files, loaded: true });
    } catch (error) {
      set({ error: messageOf(error) });
    } finally {
      set({ loading: false });
    }
  },

  importFiles: async (sourcePaths, projectId) => {
    const result = await importViaRust(sourcePaths);
    if (result.imported.length > 0) {
      // Phase 2 note: after in-app edits are saved, the index metadata will be
      // re-extracted here instead of only at import time.
      await repo.insertGpxFiles(result.imported, projectId);
      const files = await repo.listGpxFiles();
      set({ files });
    }
    return result;
  },

  deleteFile: async (file) => {
    await repo.deleteGpxFile(file.id);
    try {
      await removeLibraryFile(file.filePath);
    } catch (error) {
      console.warn("File row removed but disk copy could not be deleted:", error);
    }
    set({ files: get().files.filter((f) => f.id !== file.id) });
  },

  renameFile: async (fileId, name) => {
    await repo.renameGpxFile(fileId, name);
    const files = await repo.listGpxFiles();
    set({ files });
  },

  assignFile: async (fileId, projectId) => {
    await repo.assignGpxFile(fileId, projectId);
    const files = await repo.listGpxFiles();
    set({ files });
  },

  createProject: async (name, description) => {
    const project = await repo.createProject(name, description);
    set({ projects: [project, ...get().projects] });
    return project;
  },

  renameProject: async (id, name) => {
    await repo.renameProject(id, name);
    const projects = await repo.listProjects();
    set({ projects });
  },

  deleteProject: async (id) => {
    await repo.deleteProject(id);
    const projects = await repo.listProjects();
    const files = await repo.listGpxFiles();
    set({ projects, files });
  },

  addFile: (file) => set({ files: [file, ...get().files.filter((f) => f.id !== file.id)] }),
  updateFile: (file) => set({ files: get().files.map((f) => (f.id === file.id ? file : f)) }),
}));
