// =============================================================================
// ProjectPanel — Android project management (add, remove, view)
// =============================================================================

import { useEffect, useState } from "react";
import { useBlitzStore } from "../store";
import { open } from "@tauri-apps/plugin-dialog";

export function ProjectPanel() {
  const projects = useBlitzStore((s) => s.projects);
  const projectsLoading = useBlitzStore((s) => s.projectsLoading);
  const loadProjects = useBlitzStore((s) => s.loadProjects);
  const addProject = useBlitzStore((s) => s.addProject);
  const removeProject = useBlitzStore((s) => s.removeProject);
  const activeProjectId = useBlitzStore((s) => s.activeProjectId);
  const setActiveProject = useBlitzStore((s) => s.setActiveProject);
  const setActiveTab = useBlitzStore((s) => s.setActiveTab);

  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleAddProject = async () => {
    setError(null);
    try {
      const dirPath = await open({
        directory: true,
        title: "Select project root directory (Android or Flutter)",
      });

      if (!dirPath) return; // User cancelled

      await addProject(dirPath as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemove = async (id: string) => {
    setRemoving(id);
    setError(null);
    try {
      await removeProject(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRemoving(null);
  };

  const handleBuild = (projectPath: string) => {
    // Navigate to builds tab — the project will be available in the project selector
    setActiveTab("builds");
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Manage your Android and Flutter projects
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadProjects()}
            disabled={projectsLoading}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={handleAddProject}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium transition-colors"
          >
            Add Project...
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {projects.length === 0 && !projectsLoading && (
        <div className="p-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
          <div className="text-4xl mb-3 opacity-20">{"\u25C7"}</div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            No projects added yet
          </p>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Add an Android or Flutter project directory to get started with builds,
            APK management, and more.
          </p>
          <button
            onClick={handleAddProject}
            className="px-6 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
          >
            Add Your First Project
          </button>
        </div>
      )}

      {projectsLoading && projects.length === 0 && (
        <div className="text-center text-sm text-[var(--text-secondary)] p-8">
          Loading projects...
        </div>
      )}

      {/* Project Cards */}
      <div className="grid grid-cols-1 gap-3">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => setActiveProject(project.id)}
            className={`p-4 rounded-lg bg-[var(--bg-secondary)] border transition-colors cursor-pointer ${
              activeProjectId === project.id
                ? "border-[var(--accent)]"
                : "border-[var(--border)] hover:border-[var(--accent)]/50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="font-medium text-[var(--text-primary)]">
                  {project.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] font-mono mt-1 truncate">
                  {project.path}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    project.project_type === "flutter"
                      ? "bg-sky-500/15 text-sky-400"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                  }`}>
                    {project.project_type === "flutter" ? "Flutter" : "Android Native"}
                  </span>
                  {project.application_id && (
                    <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                      {project.application_id}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBuild(project.path);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent)] bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                >
                  Build
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(project.id);
                  }}
                  disabled={removing === project.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--error)] bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {removing === project.id ? "..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
