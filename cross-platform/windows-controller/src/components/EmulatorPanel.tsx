// =============================================================================
// EmulatorPanel — Android Virtual Device (AVD) management
// =============================================================================

import { useEffect, useState } from "react";
import { useBlitzStore } from "../store";

export function EmulatorPanel() {
  const avds = useBlitzStore((s) => s.avds);
  const avdsLoading = useBlitzStore((s) => s.avdsLoading);
  const avdsError = useBlitzStore((s) => s.avdsError);
  const loadAvds = useBlitzStore((s) => s.loadAvds);
  const startAvd = useBlitzStore((s) => s.startAvd);
  const stopAvd = useBlitzStore((s) => s.stopAvd);
  const [refreshing, setRefreshing] = useState(false);
  const [startingAvd, setStartingAvd] = useState<string | null>(null);
  const [stoppingSerial, setStoppingSerial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvds();
  }, [loadAvds]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAvds();
    setRefreshing(false);
  };

  const handleStart = async (name: string, coldBoot = false) => {
    setStartingAvd(name);
    setError(null);
    try {
      await startAvd(name, coldBoot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStartingAvd(null);
  };

  const handleStop = async (serial: string) => {
    setStoppingSerial(serial);
    setError(null);
    try {
      await stopAvd(serial);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStoppingSerial(null);
  };

  const runningAvds = avds.filter((a) => a.running);
  const stoppedAvds = avds.filter((a) => !a.running);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Emulators</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Manage Android Virtual Devices (AVDs)
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || avdsLoading}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {avdsError && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm whitespace-pre-wrap break-words">
          {avdsError}
        </div>
      )}

      {avds.length === 0 && !avdsLoading && (
        <div className="p-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
          <div className="text-4xl mb-3 opacity-20">{"\u25A3"}</div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            No AVDs found
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Create AVDs using Android Studio or the command line:
            <br />
            <code className="text-[var(--accent)] font-mono">
              avdmanager create avd -n MyDevice -k "system-images;android-34;google_apis;x86_64"
            </code>
          </p>
        </div>
      )}

      {/* Running AVDs */}
      {runningAvds.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-[var(--success)] uppercase tracking-wider mb-3">
            Running ({runningAvds.length})
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {runningAvds.map((avd) => (
              <AvdCard
                key={avd.name}
                avd={avd}
                onStart={() => {}}
                onStop={() => avd.serial && handleStop(avd.serial)}
                isStarting={false}
                isStopping={avd.serial === stoppingSerial}
              />
            ))}
          </div>
        </section>
      )}

      {/* Stopped AVDs */}
      {stoppedAvds.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Available ({stoppedAvds.length})
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {stoppedAvds.map((avd) => (
              <AvdCard
                key={avd.name}
                avd={avd}
                onStart={(coldBoot) => handleStart(avd.name, coldBoot)}
                onStop={() => {}}
                isStarting={avd.name === startingAvd}
                isStopping={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AvdCard({
  avd,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: {
  avd: {
    name: string;
    device: string;
    target: string;
    apiLevel: number;
    abi: string;
    running: boolean;
    serial: string | null;
  };
  onStart: (coldBoot: boolean) => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
}) {
  return (
    <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                avd.running ? "bg-[var(--success)]" : "bg-[var(--text-secondary)]"
              }`}
            />
            <h4 className="font-medium text-[var(--text-primary)] truncate">
              {avd.name}
            </h4>
          </div>
          {avd.serial && (
            <p className="text-[10px] text-[var(--text-secondary)] font-mono ml-4">
              {avd.serial}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1 text-xs text-[var(--text-secondary)] mb-3">
        <p>Device: {avd.device || "Generic"}</p>
        <p>Target: {avd.target || `API ${avd.apiLevel}`}</p>
        <p>ABI: {avd.abi}</p>
      </div>

      <div className="flex gap-2">
        {avd.running ? (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--error)] bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {isStopping ? "Stopping..." : "Stop"}
          </button>
        ) : (
          <>
            <button
              onClick={() => onStart(false)}
              disabled={isStarting}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--success)] bg-green-500/10 hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              {isStarting ? "Starting..." : "Start"}
            </button>
            <button
              onClick={() => onStart(true)}
              disabled={isStarting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--warning)] bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              title="Cold boot — wipe emulator RAM and restart"
            >
              Cold Boot
            </button>
          </>
        )}
      </div>
    </div>
  );
}
