import { create } from "zustand";
import {
  createUserProject,
  loadUserProjects,
  removeUserProject,
  renameUserProject,
  saveUserProjects,
  type UserProject,
} from "../lib/projects/userProjects";

/**
 * User project store.
 *
 * Holds explicitly created projects + display-name overrides, persisted to
 * browser localStorage. Projects are otherwise derived from session
 * `sourceLabel`s; this store lets the user create an empty project and rename /
 * delete one without touching any session. Local-only, no server.
 */
export type MoriProjectState = {
  initialized: boolean;
  projects: UserProject[];
  hydrate: () => void;
  /** Create an empty project; returns the new key, or null on duplicate/empty. */
  createProject: (input: { key: string; name?: string }) => string | null;
  /** Set or clear a project's display-name override (created or derived). */
  renameProject: (key: string, name: string) => void;
  /** Delete a created project record (derived projects are kept). */
  deleteProject: (key: string) => void;
};

export const useMoriProjectStore = create<MoriProjectState>((set, get) => ({
  initialized: false,
  projects: [],
  hydrate: () => {
    if (get().initialized) return;
    set({ projects: loadUserProjects(), initialized: true });
  },
  createProject: ({ key, name }) => {
    const { projects, created } = createUserProject(get().projects, { key, name });
    if (!created) return null;
    saveUserProjects(projects);
    set({ projects });
    return created.key;
  },
  renameProject: (key, name) => {
    const projects = renameUserProject(get().projects, key, name);
    saveUserProjects(projects);
    set({ projects });
  },
  deleteProject: (key) => {
    const projects = removeUserProject(get().projects, key);
    saveUserProjects(projects);
    set({ projects });
  },
}));
