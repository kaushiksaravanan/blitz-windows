import SwiftUI

struct ImportProjectSheet: View {
    @Bindable var appState: AppState
    @Binding var isPresented: Bool

    @State private var projectPath = ""
    @State private var projectType: ProjectType = .reactNative
    @State private var isImporting = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Import Project")
                .font(.headline)

            Form {
                HStack {
                    TextField("Project Path", text: $projectPath)
                    Button("Browse...") {
                        let panel = NSOpenPanel()
                        panel.canChooseDirectories = true
                        panel.canChooseFiles = false
                        panel.allowsMultipleSelection = false
                        if panel.runModal() == .OK, let url = panel.url {
                            projectPath = url.path
                            if let detected = detectProjectType(at: url) {
                                projectType = detected
                            }
                        }
                    }
                }

                Picker("Type", selection: $projectType) {
                    Text("React Native").tag(ProjectType.reactNative)
                    Text("Swift").tag(ProjectType.swift)
                    Text("Flutter").tag(ProjectType.flutter)
                }
            }
            .formStyle(.grouped)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack {
                Button("Cancel") { isPresented = false }
                    .keyboardShortcut(.cancelAction)

                Spacer()

                Button("Import") {
                    Task { await importProject() }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(projectPath.isEmpty || isImporting)
            }
        }
        .padding()
        .frame(width: 450)
    }

    /// Detect project type from directory contents.
    private func detectProjectType(at url: URL) -> ProjectType? {
        let fm = FileManager.default
        // Flutter: pubspec.yaml with "flutter:" dependency
        let pubspec = url.appendingPathComponent("pubspec.yaml")
        if fm.fileExists(atPath: pubspec.path),
           let contents = try? String(contentsOf: pubspec, encoding: .utf8),
           contents.contains("flutter:") {
            return .flutter
        }
        // Swift: .xcodeproj, .xcworkspace, or Package.swift
        let hasXcodeProj = (try? fm.contentsOfDirectory(atPath: url.path))?.contains(where: { $0.hasSuffix(".xcodeproj") || $0.hasSuffix(".xcworkspace") }) ?? false
        let hasPackageSwift = fm.fileExists(atPath: url.appendingPathComponent("Package.swift").path)
        if hasXcodeProj || hasPackageSwift {
            return .swift
        }
        // React Native: package.json with react-native dependency
        let packageJson = url.appendingPathComponent("package.json")
        if fm.fileExists(atPath: packageJson.path),
           let contents = try? String(contentsOf: packageJson, encoding: .utf8),
           contents.contains("\"react-native\"") {
            return .reactNative
        }
        return nil
    }

    private func importProject() async {
        isImporting = true
        errorMessage = nil
        defer { isImporting = false }

        let url = URL(fileURLWithPath: projectPath)

        // Validate selected type matches detected type
        if let detected = detectProjectType(at: url), detected != projectType {
            let detectedName: String
            switch detected {
            case .reactNative: detectedName = "React Native"
            case .swift: detectedName = "Swift"
            case .flutter: detectedName = "Flutter"
            }
            errorMessage = "This looks like a \(detectedName) project. Please select the correct type."
            return
        }

        let storage = ProjectStorage()
        let metadata = BlitzProjectMetadata(
            name: url.lastPathComponent,
            type: projectType,
            createdAt: Date(),
            lastOpenedAt: Date()
        )

        do {
            // Write metadata into the original project directory first,
            // then register it as a symlink in ~/.blitz/projects/.
            // This ensures all Blitz files land in the actual project, not a detached directory.
            try storage.writeMetadataToDirectory(url, metadata: metadata)
            let projectId = try storage.openProject(at: url)
            storage.ensureMCPConfig(projectId: projectId)
            storage.ensureTeenybaseBackend(projectId: projectId, projectType: projectType)
            storage.ensureClaudeFiles(projectId: projectId, projectType: projectType)
            await appState.projectManager.loadProjects()
            appState.activeProjectId = projectId
            isPresented = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
