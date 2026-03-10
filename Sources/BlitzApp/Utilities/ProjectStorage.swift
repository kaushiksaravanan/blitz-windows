import Foundation
import BlitzCore

/// Filesystem operations for ~/.blitz/projects/
struct ProjectStorage {
    let baseDirectory: URL

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.baseDirectory = home.appendingPathComponent(".blitz/projects")
    }

    /// List all projects in ~/.blitz/projects/
    func listProjects() async -> [Project] {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(at: baseDirectory, includingPropertiesForKeys: [.isDirectoryKey]) else {
            return []
        }

        var projects: [Project] = []
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        for entry in entries {
            let isDir = (try? entry.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            guard isDir else { continue }

            // Skip warm template directories
            if entry.lastPathComponent.hasPrefix(".blitz-template-warm-") { continue }

            let metadataFile = entry.appendingPathComponent(".blitz/project.json")
            guard let data = try? Data(contentsOf: metadataFile),
                  let metadata = try? decoder.decode(BlitzProjectMetadata.self, from: data) else {
                continue
            }

            let project = Project(
                id: entry.lastPathComponent,
                metadata: metadata,
                path: entry.path
            )
            projects.append(project)
        }

        return projects.sorted { ($0.metadata.lastOpenedAt ?? .distantPast) > ($1.metadata.lastOpenedAt ?? .distantPast) }
    }

    /// Read a specific project's metadata
    func readMetadata(projectId: String) -> BlitzProjectMetadata? {
        let metadataFile = baseDirectory
            .appendingPathComponent(projectId)
            .appendingPathComponent(".blitz/project.json")
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let data = try? Data(contentsOf: metadataFile) else { return nil }
        return try? decoder.decode(BlitzProjectMetadata.self, from: data)
    }

    /// Write project metadata
    func writeMetadata(projectId: String, metadata: BlitzProjectMetadata) throws {
        let projectDir = baseDirectory.appendingPathComponent(projectId)
        let blitzDir = projectDir.appendingPathComponent(".blitz")
        try FileManager.default.createDirectory(at: blitzDir, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(metadata)
        try data.write(to: blitzDir.appendingPathComponent("project.json"))
    }

    /// Delete a project directory
    func deleteProject(projectId: String) throws {
        let projectDir = baseDirectory.appendingPathComponent(projectId)
        try FileManager.default.removeItem(at: projectDir)
    }

    /// Open a project at the given URL. Validates .blitz/project.json exists,
    /// registers it in ~/.blitz/projects/ if needed, and returns the projectId.
    func openProject(at url: URL) throws -> String {
        let metadataFile = url.appendingPathComponent(".blitz/project.json")
        guard FileManager.default.fileExists(atPath: metadataFile.path) else {
            throw ProjectOpenError.notABlitzProject
        }

        let folderName = url.lastPathComponent

        // Check if already registered
        let existingDir = baseDirectory.appendingPathComponent(folderName)
        if FileManager.default.fileExists(atPath: existingDir.path) {
            // Already registered — update lastOpenedAt
            updateLastOpened(projectId: folderName)
            return folderName
        }

        // Create symlink: ~/.blitz/projects/{folderName} → selectedPath
        try FileManager.default.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: existingDir, withDestinationURL: url)

        updateLastOpened(projectId: folderName)
        return folderName
    }

    /// Update lastOpenedAt timestamp for a project
    func updateLastOpened(projectId: String) {
        guard var metadata = readMetadata(projectId: projectId) else { return }
        metadata.lastOpenedAt = Date()
        try? writeMetadata(projectId: projectId, metadata: metadata)
    }

    /// Ensure .mcp.json contains the blitz-macos MCP server entry.
    /// If the file exists, merges into the existing mcpServers key without overwriting other entries.
    /// If it doesn't exist, creates it.
    func ensureMCPConfig(projectId: String) {
        let projectDir = baseDirectory.appendingPathComponent(projectId)
        let mcpFile = projectDir.appendingPathComponent(".mcp.json")
        let home = FileManager.default.homeDirectoryForCurrentUser.path

        let blitzEntry: [String: Any] = [
            "command": "bash",
            "args": ["\(home)/.blitz/blitz-mcp-bridge.sh"]
        ]

        var root: [String: Any]
        if let data = try? Data(contentsOf: mcpFile),
           let existing = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            root = existing
            var servers = root["mcpServers"] as? [String: Any] ?? [:]
            servers["blitz-macos"] = blitzEntry
            root["mcpServers"] = servers
        } else {
            root = ["mcpServers": ["blitz-macos": blitzEntry]]
        }

        guard let data = try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? data.write(to: mcpFile)
    }

    /// Ensure CLAUDE.md and .claude/settings.local.json exist for a project.
    /// Mirrors the server-side ensureClaudeFiles() logic.
    func ensureClaudeFiles(projectId: String, projectType: ProjectType) {
        let fm = FileManager.default
        let projectDir = baseDirectory.appendingPathComponent(projectId)

        // 1. .claude/settings.local.json
        let claudeDir = projectDir.appendingPathComponent(".claude")
        let settingsFile = claudeDir.appendingPathComponent("settings.local.json")
        if !fm.fileExists(atPath: settingsFile.path) {
            try? fm.createDirectory(at: claudeDir, withIntermediateDirectories: true)
            let settings: [String: Any] = [
                "permissions": [
                    "allow": [
                        "Bash(curl:*)",
                        "Bash(xcrun simctl terminate:*)",
                        "Bash(xcrun simctl launch:*)",
                        "mcp__blitz-macos__get_project_state",
                    ]
                ],
                "enabledMcpjsonServers": ["blitz-macos"],
            ]
            if let data = try? JSONSerialization.data(withJSONObject: settings, options: [.prettyPrinted, .sortedKeys]) {
                try? data.write(to: settingsFile)
            }
        }

        // 2. CLAUDE.md
        let claudeMdFile = projectDir.appendingPathComponent("CLAUDE.md")
        if !fm.fileExists(atPath: claudeMdFile.path) {
            let content = Self.claudeMdContent(projectType: projectType)
            try? content.write(to: claudeMdFile, atomically: true, encoding: .utf8)
        }
    }

    // swiftlint:disable function_body_length
    private static func claudeMdContent(projectType: ProjectType) -> String {
        let header = projectType == .swift
            ? "# Swift Project — Blitz AI Agent Guide"
            : "# React Native Project — Blitz AI Agent Guide"

        var lines = [header, ""]
        lines.append("## blitz-ios")
        lines.append("")
        lines.append("This project is opened in **Blitz**, a web-based iOS development IDE with integrated simulator streaming. The user sees a live simulator view in their browser alongside your code. Blitz manages the build pipeline, simulator lifecycle, and dev servers — you focus on writing code.")
        lines.append("")
        lines.append("### Important: What Blitz Manages (Do NOT Do These Manually)")
        lines.append("")
        lines.append("- **Do not start the iOS simulator** — Blitz boots and manages it")
        if projectType == .reactNative {
            lines.append("- **Do not run `xcodebuild` or `react-native run-ios`** — Blitz handles builds")
            lines.append("- **Do not start Metro** (`npx react-native start`) — Blitz runs Metro automatically")
        }
        lines.append("- **Do not modify build settings or signing** — managed by Blitz")
        lines.append("")
        lines.append("### MCP Tools (`blitz-macos`)")
        lines.append("")
        lines.append("The `blitz-macos` MCP server (`.mcp.json`) lets you control the iOS simulator and query project state. Use these tools to test your changes autonomously.")
        lines.append("")
        lines.append("**Simulator interaction:**")
        lines.append("- `device_action` — Perform a single action: `tap`, `swipe`, `button` (HOME/LOCK/SIRI), `input-text`, `key`, `key-sequence`. Supports `describe_after` to capture screen state after the action.")
        lines.append("- `device_actions` — Execute multiple actions in sequence (batch). Same action types, with optional `describe_after` at the end.")
        lines.append("- `describe_screen` — Get the full UI element hierarchy (element types, labels, positions, frames). Use this to understand what's on screen before interacting.")
        lines.append("- `describe_point` — Get the UI element at specific (x, y) coordinates.")
        lines.append("")
        lines.append("**Project state and logs:**")
        lines.append("- `get_project_state` — Get runtime status, project type, dev server URLs/ports, error state, and simulator UDID. Call with `projectDir` set to your current working directory.")
        lines.append("- `query_server_logs` — Query server-side logs (sources: `vite`, `metro`, `ios-build`, `backend`, `runtime`). Supports filtering by level, source, timestamp, and search text.")
        lines.append("- `query_backend_logs` — Query application-level backend logs (console.log/error from user code).")
        lines.append("- `list_issues` — Get issues filed by the user via Blitz's visual issue tracker. Issues are pinned to screen locations and include UI element metadata.")
        lines.append("")
        lines.append("### Testing Workflow")
        lines.append("")
        lines.append("After making code changes:")
        lines.append("1. Wait briefly for hot reload / rebuild")
        lines.append("2. Use `describe_screen` to verify the UI updated as expected")
        lines.append("3. Use `device_action` to interact (tap buttons, enter text, navigate)")
        lines.append("4. Use `describe_screen` again to verify the result")
        lines.append("5. Check `query_server_logs` if something looks wrong")
        lines.append("")
        lines.append("### Issue Tracking")
        lines.append("")
        lines.append("Users can file visual issues by tapping directly on the simulator stream in Blitz. These issues include the screen coordinates, a description, and metadata about the tapped UI element. Use `list_issues` to see open issues and fix them.")

        if projectType == .reactNative {
            lines.append("")
            lines.append("### Metro Bundler")
            lines.append("")
            lines.append("Metro is managed automatically by Blitz. **DO NOT start your own Metro server** — it will conflict.")
            lines.append("- `.blitz/metro.json` contains the active Metro port and bundle URL")
            lines.append("- `.blitz/metro.log` contains Metro/app logs (including console.log from your app)")
        }

        lines.append("")
        return lines.joined(separator: "\n")
    }
    // swiftlint:enable function_body_length

    /// Clear lastOpenedAt on all projects
    func clearRecentProjects() {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(at: baseDirectory, includingPropertiesForKeys: [.isDirectoryKey]) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        for entry in entries {
            let isDir = (try? entry.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            guard isDir else { continue }
            if entry.lastPathComponent.hasPrefix(".blitz-template-warm-") { continue }

            let projectId = entry.lastPathComponent
            guard var metadata = readMetadata(projectId: projectId) else { continue }
            metadata.lastOpenedAt = nil
            try? writeMetadata(projectId: projectId, metadata: metadata)
        }
    }
}

enum ProjectOpenError: LocalizedError {
    case notABlitzProject

    var errorDescription: String? {
        switch self {
        case .notABlitzProject:
            return "Not a Blitz project. The selected folder does not contain .blitz/project.json. Use Import to add an external project."
        }
    }
}
