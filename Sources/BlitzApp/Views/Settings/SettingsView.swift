import SwiftUI

struct SettingsView: View {
    @Bindable var settings: SettingsService
    var appState: AppState
    var mcpServer: MCPServerService?

    @State private var bundleId: String = ""

    private let gateableCategories: [(String, String)] = [
        ("ascFormMutation", "ASC form editing"),
        ("ascScreenshotMutation", "ASC screenshot upload"),
        ("ascSubmitMutation", "ASC submit for review"),
        ("projectMutation", "Project mutations"),
        ("databaseMutation", "Database mutations"),
        ("settingsMutation", "Settings mutations"),
        ("simulatorControl", "Simulator control"),
        ("recording", "Recording"),
    ]

    var body: some View {
        Form {
            if let project = appState.activeProject {
                Section("Project") {
                    HStack {
                        Text("Current Project")
                        Spacer()
                        Text(project.name)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Text("Bundle ID")
                        Spacer()
                        TextField("com.example.app", text: $bundleId)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 260)
                            .onSubmit { saveBundleId() }
                    }

                    HStack {
                        Link("Find your bundle ID on App Store Connect",
                             destination: URL(string: "https://appstoreconnect.apple.com/apps")!)
                            .font(.callout)
                        Spacer()
                        Button("Save") { saveBundleId() }
                            .buttonStyle(.bordered)
                            .disabled(bundleId.trimmingCharacters(in: .whitespaces) == (project.metadata.bundleIdentifier ?? ""))
                    }
                }
                .onAppear {
                    bundleId = project.metadata.bundleIdentifier ?? ""
                }
                .onChange(of: appState.activeProjectId) {
                    bundleId = appState.activeProject?.metadata.bundleIdentifier ?? ""
                }
            }

            Section("Simulator") {
                Picker("Frame Rate", selection: $settings.simulatorFPS) {
                    Text("30 FPS").tag(30)
                    Text("60 FPS").tag(60)
                }

                Toggle("Show Cursor Overlay", isOn: $settings.showCursor)

                if settings.showCursor {
                    HStack {
                        Text("Cursor Size")
                        Slider(value: $settings.cursorSize, in: 10...40, step: 2)
                        Text("\(Int(settings.cursorSize))px")
                            .monospacedDigit()
                            .frame(width: 40, alignment: .trailing)
                    }
                }
            }

            Section("Recording") {
                Picker("Format", selection: $settings.recordingFormat) {
                    Text("MOV (H.264)").tag("mov")
                    Text("MP4 (H.264)").tag("mp4")
                }
            }

            Section("Permissions") {
                Toggle("Auto-navigate to tab on tool call", isOn: $settings.autoNavEnabled)
                    .onChange(of: settings.autoNavEnabled) { _, _ in settings.save() }

                Divider()

                Toggle("Approve all", isOn: Binding(
                    get: {
                        gateableCategories.allSatisfy { settings.permissionToggles[$0.0] ?? true }
                    },
                    set: { newValue in
                        for (category, _) in gateableCategories {
                            settings.permissionToggles[category] = newValue
                        }
                        settings.save()
                    }
                ))
                .fontWeight(.medium)

                ForEach(gateableCategories, id: \.0) { category, label in
                    Toggle(label, isOn: Binding(
                        get: { settings.permissionToggles[category] ?? true },
                        set: { newValue in
                            settings.permissionToggles[category] = newValue
                            settings.save()
                        }
                    ))
                }
            }

            MCPSetupSection(mcpServer: mcpServer)

            Section("About") {
                HStack {
                    Text("Blitz")
                    Spacer()
                    Text("1.0.0")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .frame(maxWidth: 500)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func saveBundleId() {
        guard let projectId = appState.activeProjectId else { return }
        let storage = ProjectStorage()
        guard var metadata = storage.readMetadata(projectId: projectId) else { return }
        let trimmed = bundleId.trimmingCharacters(in: .whitespaces)
        metadata.bundleIdentifier = trimmed.isEmpty ? nil : trimmed
        try? storage.writeMetadata(projectId: projectId, metadata: metadata)

        // Reload projects so activeProject picks up the change
        Task {
            await appState.projectManager.loadProjects()
            // Re-fetch app if ASC credentials are configured
            if !trimmed.isEmpty, appState.ascManager.credentials != nil {
                await appState.ascManager.fetchApp(bundleId: trimmed)
            }
        }
    }
}
