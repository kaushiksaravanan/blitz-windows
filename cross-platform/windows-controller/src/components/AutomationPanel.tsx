import { useEffect, useMemo, useState } from "react";
import { useBlitzStore } from "../store";

const TIMESPIN_PATH = "C:\\Users\\I587436\\Downloads\\timespin";

export function AutomationPanel() {
  const projects = useBlitzStore((s) => s.projects);
  const devices = useBlitzStore((s) => s.devices);
  const loadDevices = useBlitzStore((s) => s.loadDevices);
  const addProject = useBlitzStore((s) => s.addProject);

  const uiAutomationState = useBlitzStore((s) => s.uiAutomationState);
  const uiAutomationLogs = useBlitzStore((s) => s.uiAutomationLogs);
  const uiAutomationLastResult = useBlitzStore((s) => s.uiAutomationLastResult);

  const runUiAutomationTest = useBlitzStore((s) => s.runUiAutomationTest);
  const pauseUiAutomationTest = useBlitzStore((s) => s.pauseUiAutomationTest);
  const resumeUiAutomationTest = useBlitzStore((s) => s.resumeUiAutomationTest);
  const stopUiAutomationTest = useBlitzStore((s) => s.stopUiAutomationTest);
  const loadUiAutomationState = useBlitzStore((s) => s.loadUiAutomationState);

  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [packageName, setPackageName] = useState<string>("");
  const [instruction, setInstruction] = useState<string>(
    "Open this app and try ordering. First explore all screens and build a structured graph. Then execute the plan and test combinations. Record video while testing. If the UI tree changes, start a fresh re-index pass."
  );

  const [maxSteps, setMaxSteps] = useState<number>(80);
  const [actionDelayMs, setActionDelayMs] = useState<number>(900);
  const [maxActionsPerScreen, setMaxActionsPerScreen] = useState<number>(8);
  const [captureVideo, setCaptureVideo] = useState<boolean>(true);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number>(90);
  const [enableOcr, setEnableOcr] = useState<boolean>(true);
  const [logcatLinesPerStep, setLogcatLinesPerStep] = useState<number>(60);

  const [error, setError] = useState<string | null>(null);
  const [addingTimeSpin, setAddingTimeSpin] = useState<boolean>(false);
  const [timeSpinBootstrapped, setTimeSpinBootstrapped] = useState<boolean>(false);

  useEffect(() => {
    loadUiAutomationState();
  }, [loadUiAutomationState]);

  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0].path);
    }
  }, [projects, selectedProject]);

  useEffect(() => {
    if (timeSpinBootstrapped) return;
    let active = true;

    const bootstrap = async () => {
      const existing = projects.find((p) => p.path === TIMESPIN_PATH);
      if (existing) {
        if (active) {
          setSelectedProject(TIMESPIN_PATH);
          setTimeSpinBootstrapped(true);
        }
        return;
      }

      try {
        await addProject(TIMESPIN_PATH);
      } catch {
        // ignore add errors (missing path or already added)
      }

      if (!active) return;
      const found = useBlitzStore.getState().projects.find((p) => p.path === TIMESPIN_PATH);
      if (found) setSelectedProject(TIMESPIN_PATH);
      setTimeSpinBootstrapped(true);
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [addProject, projects, timeSpinBootstrapped]);

  useEffect(() => {
    if (!selectedProject) return;
    const project = projects.find((p) => p.path === selectedProject);
    if (project?.applicationId) {
      setPackageName(project.applicationId);
    }
  }, [selectedProject, projects]);

  useEffect(() => {
    if (!selectedDevice) {
      const first = devices.find((d) => d.status === "device");
      if (first) setSelectedDevice(first.serial);
    }
  }, [devices, selectedDevice]);

  const connectedDevices = useMemo(
    () => devices.filter((d) => d.status === "device"),
    [devices]
  );

  const running = uiAutomationState.phase === "running";
  const paused = uiAutomationState.phase === "paused";
  const runActive = running || paused;

  const handleRun = async () => {
    if (!selectedProject || !selectedDevice || !packageName.trim() || !instruction.trim()) return;
    setError(null);

    const normalizedSteps = Math.max(3, Math.min(500, Math.floor(maxSteps || 80)));
    const normalizedDelay = Math.max(150, Math.min(5000, Math.floor(actionDelayMs || 900)));
    const normalizedActionsPerScreen = Math.max(1, Math.min(30, Math.floor(maxActionsPerScreen || 8)));
    const normalizedVideoSeconds = Math.max(10, Math.min(180, Math.floor(videoDurationSeconds || 90)));
    const normalizedLogcatLines = Math.max(20, Math.min(500, Math.floor(logcatLinesPerStep || 60)));

    setMaxSteps(normalizedSteps);
    setActionDelayMs(normalizedDelay);
    setMaxActionsPerScreen(normalizedActionsPerScreen);
    setVideoDurationSeconds(normalizedVideoSeconds);
    setLogcatLinesPerStep(normalizedLogcatLines);

    try {
      await runUiAutomationTest({
        projectPath: selectedProject,
        serial: selectedDevice,
        packageName: packageName.trim(),
        instruction: instruction.trim(),
        maxSteps: normalizedSteps,
        actionDelayMs: normalizedDelay,
        maxActionsPerScreen: normalizedActionsPerScreen,
        captureVideo,
        videoDurationSeconds: normalizedVideoSeconds,
        enableOcr,
        logcatLinesPerStep: normalizedLogcatLines,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePause = async () => {
    setError(null);
    try {
      await pauseUiAutomationTest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleResume = async () => {
    setError(null);
    try {
      await resumeUiAutomationTest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      await stopUiAutomationTest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddTimeSpin = async () => {
    setAddingTimeSpin(true);
    setError(null);
    try {
      await addProject(TIMESPIN_PATH);
      setSelectedProject(TIMESPIN_PATH);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/already added/i.test(message)) {
        setError(message);
      } else {
        setSelectedProject(TIMESPIN_PATH);
      }
    }
    setAddingTimeSpin(false);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Automation Testing</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Assistive UI graph exploration with OCR, logcat traces, and run video capture.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddTimeSpin}
            disabled={addingTimeSpin || runActive}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-50"
          >
            {addingTimeSpin ? "Adding..." : "Use TimeSpin Sample"}
          </button>
          <button
            onClick={() => loadDevices()}
            disabled={runActive}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-50"
          >
            Refresh Devices
          </button>
        </div>
      </div>

      {(error || uiAutomationState.error) && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--error)] text-sm">
          {error || uiAutomationState.error}
        </div>
      )}

      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Run Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              disabled={runActive}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name} ({p.projectType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Device</label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              disabled={runActive}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
            >
              <option value="">Select connected device...</option>
              {connectedDevices.map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model || d.serial} {d.isEmulator ? "(Emulator)" : "(Physical)"}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Package Name</label>
            <input
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              disabled={runActive}
              placeholder="com.example.app"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Instruction</label>
            <textarea
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={runActive}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <NumberField
            label="Max Steps"
            value={maxSteps}
            min={3}
            max={500}
            disabled={runActive}
            onChange={setMaxSteps}
          />
          <NumberField
            label="Action Delay (ms)"
            value={actionDelayMs}
            min={150}
            max={5000}
            disabled={runActive}
            onChange={setActionDelayMs}
          />
          <NumberField
            label="Actions/Screen"
            value={maxActionsPerScreen}
            min={1}
            max={30}
            disabled={runActive}
            onChange={setMaxActionsPerScreen}
          />
          <NumberField
            label="Video Seconds"
            value={videoDurationSeconds}
            min={10}
            max={180}
            disabled={runActive}
            onChange={setVideoDurationSeconds}
          />
          <NumberField
            label="Logcat/Step"
            value={logcatLinesPerStep}
            min={20}
            max={500}
            disabled={runActive}
            onChange={setLogcatLinesPerStep}
          />
        </div>

        <div className="flex items-center gap-4 text-sm text-[var(--text-primary)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={captureVideo}
              onChange={(e) => setCaptureVideo(e.target.checked)}
              disabled={runActive}
            />
            Capture Video
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enableOcr}
              onChange={(e) => setEnableOcr(e.target.checked)}
              disabled={runActive}
            />
            Enable OCR (uses tesseract when available)
          </label>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleRun}
            disabled={
              runActive || !selectedProject || !selectedDevice || !packageName.trim() || !instruction.trim()
            }
            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {running ? "Running Automation..." : "Run Automation Test"}
          </button>

          <button
            onClick={handlePause}
            disabled={!running}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Pause
          </button>

          <button
            onClick={handleResume}
            disabled={!paused}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Resume
          </button>

          <button
            onClick={handleStop}
            disabled={!runActive}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Run Status</h3>
          <span className="text-xs text-[var(--text-secondary)]">{uiAutomationState.progress}%</span>
        </div>
        <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              uiAutomationState.phase === "error"
                ? "bg-[var(--error)]"
                : uiAutomationState.phase === "paused"
                  ? "bg-[var(--warning)]"
                  : uiAutomationState.phase === "stopped"
                    ? "bg-[var(--warning)]"
                    : uiAutomationState.phase === "complete"
                      ? "bg-[var(--success)]"
                      : "bg-[var(--accent)]"
            }`}
            style={{ width: `${uiAutomationState.progress}%` }}
          />
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{uiAutomationState.currentStep || "Idle"}</p>
      </div>

      {uiAutomationLastResult && (
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Latest Result</h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Screens: {uiAutomationLastResult.discoveredScreens} · Actions: {uiAutomationLastResult.exploredActions} · Tree changes: {uiAutomationLastResult.treeChangeCount}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">Graph: {uiAutomationLastResult.graphPath}</p>
          <p className="text-xs text-[var(--text-secondary)]">Events: {uiAutomationLastResult.eventLogPath}</p>
          <p className="text-xs text-[var(--text-secondary)]">Summary: {uiAutomationLastResult.summaryPath}</p>
          {uiAutomationLastResult.videoPath && (
            <p className="text-xs text-[var(--text-secondary)]">Video: {uiAutomationLastResult.videoPath}</p>
          )}
          {uiAutomationLastResult.stoppedByUser && (
            <p className="text-xs text-[var(--warning)]">Run ended early by user stop request.</p>
          )}
          {uiAutomationLastResult.finalPhase === "error" && (
            <p className="text-xs text-[var(--error)]">Run ended with errors. Check logs and notes.</p>
          )}
          {uiAutomationLastResult.notes.length > 0 && (
            <details className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] p-2">
              <summary className="text-xs cursor-pointer text-[var(--text-secondary)]">Run notes</summary>
              <ul className="mt-2 text-xs text-[var(--text-secondary)] list-disc pl-4 space-y-1">
                {uiAutomationLastResult.notes.map((note, idx) => (
                  <li key={`${idx}-${note.slice(0, 20)}`}>{note}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Automation Logs</h3>
        <div className="max-h-80 overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border)] rounded-md p-3 font-mono text-[11px] text-[var(--text-secondary)] space-y-1">
          {uiAutomationLogs.length === 0 ? (
            <p>No run logs yet.</p>
          ) : (
            uiAutomationLogs.map((line, i) => <div key={`${i}-${line.slice(0, 20)}`}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-secondary)] mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const next = parseInt(e.target.value, 10);
          if (!Number.isFinite(next)) {
            onChange(min);
            return;
          }
          onChange(Math.max(min, Math.min(max, next)));
        }}
        onBlur={(e) => {
          const next = parseInt(e.target.value, 10);
          if (!Number.isFinite(next)) {
            onChange(min);
            return;
          }
          onChange(Math.max(min, Math.min(max, next)));
        }}
        className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
      />
    </div>
  );
}
