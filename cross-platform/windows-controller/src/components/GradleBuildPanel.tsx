// =============================================================================
// BuildPanel — Gradle + Flutter build execution with live log streaming
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useBlitzStore } from "../store";

// Gradle tasks (for android-native projects)
const GRADLE_TASKS = [
  { value: "assembleDebug", label: "assembleDebug" },
  { value: "assembleRelease", label: "assembleRelease" },
  { value: "installDebug", label: "installDebug" },
  { value: "installRelease", label: "installRelease" },
  { value: "test", label: "test" },
  { value: "lint", label: "lint" },
  { value: "clean", label: "clean" },
  { value: "build", label: "build" },
];

// Flutter tasks (for flutter projects)
const FLUTTER_TASKS = [
  { value: "build apk --debug", label: "Build APK (Debug)" },
  { value: "build apk --release", label: "Build APK (Release)" },
  { value: "build appbundle", label: "Build App Bundle" },
  { value: "clean", label: "Clean" },
  { value: "pub get", label: "Pub Get" },
  { value: "test", label: "Test" },
  { value: "analyze", label: "Analyze" },
  { value: "build apk --split-per-abi", label: "Build APK (Split ABI)" },
];

export function GradleBuildPanel() {
  const projects = useBlitzStore((s) => s.projects);
  const builds = useBlitzStore((s) => s.builds);
  const buildLogs = useBlitzStore((s) => s.buildLogs);
  const buildLoading = useBlitzStore((s) => s.buildLoading);
  const activeBuildId = useBlitzStore((s) => s.activeBuildId);
  const startBuild = useBlitzStore((s) => s.startBuild);
  const getBuildStatus = useBlitzStore((s) => s.getBuildStatus);
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(0);
  const [task, setTask] = useState("");
  const [extraArgs, setExtraArgs] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // Determine project type of selected project
  const selectedProject = projects[selectedProjectIdx] ?? null;
  const isFlutter = selectedProject?.project_type === "flutter";
  const availableTasks = isFlutter ? FLUTTER_TASKS : GRADLE_TASKS;

  // Reset task when project type changes
  useEffect(() => {
    if (availableTasks.length > 0) {
      setTask(availableTasks[0].value);
    }
  }, [isFlutter, selectedProjectIdx]);

  // Auto-scroll build logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [buildLogs]);

  // Poll build status when a build is active
  useEffect(() => {
    if (!activeBuildId) return;
    const interval = setInterval(() => {
      getBuildStatus(activeBuildId);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeBuildId, getBuildStatus]);

  const handleStartBuild = async () => {
    const project = projects[selectedProjectIdx];
    if (!project) return;
    const args = extraArgs.trim()
      ? extraArgs.split(/\s+/).filter(Boolean)
      : undefined;
    await startBuild(project.path, task, args);
  };

  const activeBuild = activeBuildId
    ? builds.find((b) => b.id === activeBuildId)
    : null;

  const isBuilding =
    activeBuild &&
    activeBuild.phase !== "complete" &&
    activeBuild.phase !== "failed" &&
    activeBuild.phase !== "cancelled";

  const completedBuilds = builds.filter(
    (b) => b.phase === "complete" || b.phase === "failed" || b.phase === "cancelled"
  );

  return (
    <div className="h-full flex flex-col">
      {/* Build Controls */}
      <div className="p-4 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">
          {isFlutter ? "Flutter Build" : "Gradle Build"}
        </h2>

        <div className="flex gap-3 items-end">
          {/* Project Selector */}
          <div className="flex-1">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Project
            </label>
            {projects.length === 0 ? (
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-secondary)]">
                No projects — add one in the Projects tab
              </div>
            ) : (
              <select
                value={selectedProjectIdx}
                onChange={(e) => setSelectedProjectIdx(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {projects.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.name} ({p.project_type}) — {p.path}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Task */}
          <div className="w-52">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              {isFlutter ? "Flutter Task" : "Gradle Task"}
            </label>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {availableTasks.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Extra Args */}
          <div className="w-40">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Extra Args
            </label>
            <input
              type="text"
              value={extraArgs}
              onChange={(e) => setExtraArgs(e.target.value)}
              placeholder={isFlutter ? "--verbose" : "--stacktrace"}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartBuild}
            disabled={projects.length === 0 || buildLoading || !!isBuilding}
            className="px-6 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {buildLoading ? "Starting..." : isBuilding ? "Building..." : "Start Build"}
          </button>
        </div>

        {/* Active Build Progress */}
        {activeBuild && isBuilding && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium capitalize">
                {activeBuild.phase.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {activeBuild.progress}%
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                style={{ width: `${activeBuild.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Build result */}
        {activeBuild && !isBuilding && (
          <div
            className={`mt-4 p-3 rounded-lg border ${
              activeBuild.phase === "complete"
                ? "bg-green-500/10 border-green-500/30"
                : "bg-red-500/10 border-red-500/30"
            }`}
          >
            <span
              className={`text-sm font-medium ${
                activeBuild.phase === "complete"
                  ? "text-[var(--success)]"
                  : "text-[var(--error)]"
              }`}
            >
              Build {activeBuild.phase}
            </span>
            {activeBuild.output_apk && (
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
                APK: {activeBuild.output_apk}
              </p>
            )}
            {activeBuild.error && (
              <p className="text-xs text-[var(--error)] mt-1">
                {activeBuild.error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Build Logs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Build Output ({buildLogs.length} lines)
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5">
          {buildLogs.length === 0 ? (
            <p className="text-[var(--text-secondary)]">
              Build output will appear here when you start a build...
            </p>
          ) : (
            buildLogs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("ERROR") || line.includes("FAILED") || line.includes("Error:")
                    ? "text-[var(--error)]"
                    : line.includes("WARNING") || line.startsWith("w:")
                      ? "text-[var(--warning)]"
                      : line.includes("BUILD SUCCESSFUL") || line.includes("Built build")
                        ? "text-[var(--success)]"
                        : "text-[var(--text-primary)]"
                }
              >
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Build History — use .slice().reverse() to avoid mutating in render */}
      {completedBuilds.length > 0 && (
        <div className="border-t border-[var(--border)] p-4 max-h-40 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
            History
          </h3>
          {[...completedBuilds].reverse().map((build) => (
            <div
              key={build.id}
              className="flex justify-between items-center py-1.5"
            >
              <div>
                <span className="text-xs">{build.task}</span>
                <span className="text-[10px] text-[var(--text-secondary)] ml-2">
                  {build.project_path.split("\\").pop() || build.project_path}
                </span>
              </div>
              <span
                className={`text-xs font-medium ${
                  build.phase === "complete"
                    ? "text-[var(--success)]"
                    : "text-[var(--error)]"
                }`}
              >
                {build.phase}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
