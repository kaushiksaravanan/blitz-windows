import Foundation

/// Async wrapper around Process for running shell commands
public struct ProcessRunner: Sendable {

    public init() {}

    public struct ProcessError: Error, LocalizedError {
        public let command: String
        public let exitCode: Int32
        public let stderr: String

        public init(command: String, exitCode: Int32, stderr: String) {
            self.command = command
            self.exitCode = exitCode
            self.stderr = stderr
        }

        public var errorDescription: String? {
            "Command '\(command)' failed with exit code \(exitCode): \(stderr)"
        }
    }

    /// Run a command and return stdout
    @discardableResult
    public static func run(
        _ executable: String,
        arguments: [String] = [],
        environment: [String: String]? = nil,
        currentDirectory: String? = nil,
        timeout: TimeInterval = 30
    ) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()

            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = [executable] + arguments
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            if let env = environment {
                var processEnv = ProcessInfo.processInfo.environment
                for (key, value) in env {
                    processEnv[key] = value
                }
                process.environment = processEnv
            }

            if let dir = currentDirectory {
                process.currentDirectoryURL = URL(fileURLWithPath: dir)
            }

            process.terminationHandler = { proc in
                let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                let stdout = String(data: stdoutData, encoding: .utf8) ?? ""
                let stderr = String(data: stderrData, encoding: .utf8) ?? ""

                if proc.terminationStatus == 0 {
                    continuation.resume(returning: stdout)
                } else {
                    continuation.resume(throwing: ProcessError(
                        command: "\(executable) \(arguments.joined(separator: " "))",
                        exitCode: proc.terminationStatus,
                        stderr: stderr.isEmpty ? stdout : stderr
                    ))
                }
            }

            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    /// Run a command and stream stdout/stderr line by line.
    /// Check `ManagedProcess.launchError` after calling to detect launch failures.
    public static func stream(
        _ executable: String,
        arguments: [String] = [],
        environment: [String: String]? = nil,
        currentDirectory: String? = nil,
        onStdout: @escaping @Sendable (String) -> Void,
        onStderr: @escaping @Sendable (String) -> Void
    ) -> ManagedProcess {
        let process = Process()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [executable] + arguments
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        if let env = environment {
            var processEnv = ProcessInfo.processInfo.environment
            for (key, value) in env {
                processEnv[key] = value
            }
            process.environment = processEnv
        }

        if let dir = currentDirectory {
            process.currentDirectoryURL = URL(fileURLWithPath: dir)
        }

        stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
            onStdout(line)
        }

        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
            onStderr(line)
        }

        var launchErr: Error?
        do {
            try process.run()
        } catch {
            launchErr = error
        }

        return ManagedProcess(process: process, stdoutPipe: stdoutPipe, stderrPipe: stderrPipe, launchError: launchErr)
    }
}

/// A running process that can be terminated
public final class ManagedProcess: @unchecked Sendable {
    public let process: Process
    private let stdoutPipe: Pipe
    private let stderrPipe: Pipe

    /// Non-nil if the process failed to launch
    public let launchError: Error?

    init(process: Process, stdoutPipe: Pipe, stderrPipe: Pipe, launchError: Error? = nil) {
        self.process = process
        self.stdoutPipe = stdoutPipe
        self.stderrPipe = stderrPipe
        self.launchError = launchError
    }

    public var isRunning: Bool { process.isRunning }

    /// Whether the process was successfully started
    public var didLaunch: Bool { launchError == nil && process.processIdentifier != 0 }

    public func terminate() {
        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil
        if process.isRunning {
            process.terminate()
        }
    }

    /// Wait for the process to exit. Returns immediately if the process never launched.
    public func waitUntilExit() async {
        // If the process never started, return immediately
        guard didLaunch else { return }

        // Use Process.waitUntilExit() on a background queue to avoid race conditions
        // with terminationHandler + isRunning check
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            DispatchQueue.global(qos: .userInitiated).async { [process] in
                process.waitUntilExit()
                continuation.resume()
            }
        }
    }

    deinit {
        terminate()
    }
}
