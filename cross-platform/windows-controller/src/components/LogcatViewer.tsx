// =============================================================================
// LogcatViewer — Android logcat viewer with filtering
// =============================================================================

import { useRef, useEffect, useState } from "react";
import { useBlitzStore } from "../store";

const LOGCAT_LEVELS = ["V", "D", "I", "W", "E", "F"] as const;

export function LogcatViewer() {
  const devices = useBlitzStore((s) => s.devices);
  const logcatLines = useBlitzStore((s) => s.logcatLines);
  const logcatLoading = useBlitzStore((s) => s.logcatLoading);
  const logcatSerial = useBlitzStore((s) => s.logcatSerial);
  const logcatError = useBlitzStore((s) => s.logcatError);
  const loadLogcat = useBlitzStore((s) => s.loadLogcat);
  const clearLogcat = useBlitzStore((s) => s.clearLogcat);

  const [selectedSerial, setSelectedSerial] = useState(logcatSerial || "");
  const [filterText, setFilterText] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [lineCount, setLineCount] = useState(500);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Select first device if none selected
  useEffect(() => {
    if (!selectedSerial && devices.length > 0) {
      setSelectedSerial(devices[0].serial);
    }
  }, [devices, selectedSerial]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logcatLines, autoScroll]);

  const handleLoad = () => {
    if (!selectedSerial) return;
    loadLogcat(selectedSerial, lineCount);
  };

  const handleClear = async () => {
    if (!selectedSerial) return;
    await clearLogcat(selectedSerial);
  };

  // Filter lines client-side
  const filteredLines = logcatLines.filter((line) => {
    if (filterText && !line.toLowerCase().includes(filterText.toLowerCase())) {
      return false;
    }
    if (filterLevel) {
      // Logcat format: "mm-dd hh:mm:ss.mmm  PID  TID LEVEL TAG : message"
      // Level is a single char: V, D, I, W, E, F
      const levelMatch = line.match(/\s([VDIWEF])\s/);
      if (levelMatch) {
        const lineLevel = levelMatch[1];
        const minIdx = LOGCAT_LEVELS.indexOf(filterLevel as typeof LOGCAT_LEVELS[number]);
        const lineIdx = LOGCAT_LEVELS.indexOf(lineLevel as typeof LOGCAT_LEVELS[number]);
        if (lineIdx < minIdx) return false;
      }
    }
    return true;
  });

  const getLevelColor = (line: string): string => {
    if (line.match(/\sE\s/) || line.includes(" E ")) return "text-[var(--error)]";
    if (line.match(/\sW\s/) || line.includes(" W ")) return "text-[var(--warning)]";
    if (line.match(/\sI\s/) || line.includes(" I ")) return "text-[var(--accent)]";
    if (line.match(/\sD\s/) || line.includes(" D ")) return "text-[var(--success)]";
    return "text-[var(--text-primary)]";
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Logcat</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-[var(--text-secondary)]">Auto-scroll</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 items-end">
          {/* Device selector */}
          <div className="w-56">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Device
            </label>
            <select
              value={selectedSerial}
              onChange={(e) => setSelectedSerial(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select device...</option>
              {devices.map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model || d.serial} ({d.serial})
                </option>
              ))}
            </select>
          </div>

          {/* Min level */}
          <div className="w-28">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Min Level
            </label>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">All</option>
              {LOGCAT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l} — {levelName(l)}
                </option>
              ))}
            </select>
          </div>

          {/* Search filter */}
          <div className="flex-1">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Filter
            </label>
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search logs... (tag, message, PID)"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Lines */}
          <div className="w-24">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Lines
            </label>
            <input
              type="number"
              value={lineCount}
              onChange={(e) => setLineCount(Number(e.target.value) || 500)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Actions */}
          <button
            onClick={handleLoad}
            disabled={!selectedSerial || logcatLoading}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {logcatLoading ? "Loading..." : "Load"}
          </button>
          <button
            onClick={handleClear}
            disabled={!selectedSerial}
            className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-[var(--error)] font-medium text-sm transition-colors disabled:opacity-50"
          >
            Clear
          </button>
        </div>

        {logcatError && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--error)] text-sm whitespace-pre-wrap break-words">
            {logcatError}
          </div>
        )}
      </div>

      {/* Log Output */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-1.5 border-b border-[var(--border)] flex justify-between items-center">
          <span className="text-[10px] text-[var(--text-secondary)]">
            {filteredLines.length} / {logcatLines.length} lines
            {logcatSerial && ` from ${logcatSerial}`}
          </span>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5 bg-[var(--bg-primary)]"
        >
          {logcatLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
              <p>Select a device and click Load to view logcat output.</p>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
              <p>No lines match the current filter.</p>
            </div>
          ) : (
            filteredLines.map((line, i) => (
              <div key={`${logcatSerial}-${i}-${line.substring(0, 30)}`} className="flex">
                <span className="text-[var(--text-secondary)] w-12 shrink-0 text-right mr-4 select-none">
                  {i + 1}
                </span>
                <span className={getLevelColor(line)}>{line}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function levelName(level: string): string {
  const names: Record<string, string> = {
    V: "Verbose",
    D: "Debug",
    I: "Info",
    W: "Warn",
    E: "Error",
    F: "Fatal",
  };
  return names[level] || level;
}
