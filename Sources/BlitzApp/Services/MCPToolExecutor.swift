import Foundation
import AppKit
import BlitzCore

/// Runs an async operation with a timeout. Throws CancellationError if the deadline is exceeded.
private func withThrowingTimeout<T: Sendable>(seconds: TimeInterval, operation: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(for: .seconds(seconds))
            throw CancellationError()
        }
        guard let result = try await group.next() else {
            throw CancellationError()
        }
        group.cancelAll()
        return result
    }
}

/// Executes MCP tool calls against AppState.
/// Holds pending approval continuations for destructive operations.
actor MCPToolExecutor {
    private let appState: AppState
    private let deviceInteraction: DeviceInteractionService
    private var pendingContinuations: [String: CheckedContinuation<Bool, Never>] = [:]

    init(appState: AppState, deviceInteraction: DeviceInteractionService) {
        self.appState = appState
        self.deviceInteraction = deviceInteraction
    }

    /// Execute a tool call, requesting approval if needed
    func execute(name: String, arguments: [String: Any]) async throws -> [String: Any] {
        let category = MCPToolRegistry.category(for: name)

        // Pre-navigate for ASC form tools so the user sees the target tab before approving
        var previousTab: AppTab?
        if name == "asc_fill_form" || name == "asc_upload_screenshots" || name == "asc_open_submit_preview" {
            previousTab = await preNavigateASCTool(name: name, arguments: arguments)
        }

        let request = ApprovalRequest(
            id: UUID().uuidString,
            toolName: name,
            description: humanDescription(tool: name, args: arguments),
            parameters: arguments.mapValues { "\($0)" },
            category: category
        )

        if request.requiresApproval {
            let approved = await requestApproval(request)
            guard approved else {
                // Navigate back if denied
                if let prev = previousTab {
                    await MainActor.run { appState.activeTab = prev }
                    _ = await MainActor.run { appState.ascManager.pendingFormValues.removeAll() }
                }
                return mcpText("Tool '\(name)' was denied by the user.")
            }
        }

        return try await executeTool(name: name, arguments: arguments)
    }

    /// Navigate to the appropriate tab before approval, and set pending form values.
    /// Returns the previous tab so we can navigate back if denied.
    private func preNavigateASCTool(name: String, arguments: [String: Any]) async -> AppTab? {
        let previousTab = await MainActor.run { appState.activeTab }

        let targetTab: AppTab?
        if name == "asc_fill_form" {
            let tab = arguments["tab"] as? String ?? ""
            switch tab {
            case "storeListing": targetTab = .storeListing
            case "appDetails": targetTab = .appDetails
            case "pricing": targetTab = .pricing
            case "review.ageRating", "review.contact": targetTab = .review
            case "settings.bundleId": targetTab = .settings
            default: targetTab = nil
            }
        } else if name == "asc_open_submit_preview" {
            targetTab = .ascOverview
        } else if name == "asc_upload_screenshots" {
            targetTab = .screenshots
        } else {
            targetTab = nil
        }

        if let targetTab {
            await MainActor.run { appState.activeTab = targetTab }
            // Ensure tab data is loaded
            if targetTab.isASCTab {
                await appState.ascManager.fetchTabData(targetTab)
            }
        }

        // For asc_fill_form, pre-populate pending values so the form shows intended changes
        if name == "asc_fill_form",
           let tab = arguments["tab"] as? String,
           let fieldsArray = arguments["fields"] as? [[String: Any]] {
            var fieldMap: [String: String] = [:]
            for item in fieldsArray {
                if let field = item["field"] as? String, let value = item["value"] as? String {
                    fieldMap[field] = value
                }
            }
            let fieldMapCopy = fieldMap
            await MainActor.run {
                appState.ascManager.pendingFormValues[tab] = fieldMapCopy
                appState.ascManager.pendingFormVersion += 1
            }
        }

        return previousTab
    }

    /// Resume a pending approval
    nonisolated func resolveApproval(id: String, approved: Bool) {
        Task { await _resolveApproval(id: id, approved: approved) }
    }

    private func _resolveApproval(id: String, approved: Bool) {
        guard let continuation = pendingContinuations.removeValue(forKey: id) else { return }
        continuation.resume(returning: approved)
    }

    // MARK: - Approval Flow

    private func requestApproval(_ request: ApprovalRequest) async -> Bool {
        // Show alert on main thread
        await MainActor.run {
            appState.pendingApproval = request
            appState.showApprovalAlert = true
        }

        // Suspend until user approves/denies or timeout
        let approved = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            pendingContinuations[request.id] = continuation

            // 5-minute auto-deny timeout
            Task {
                try? await Task.sleep(for: .seconds(300))
                if pendingContinuations[request.id] != nil {
                    _resolveApproval(id: request.id, approved: false)
                }
            }
        }

        // Clear alert
        await MainActor.run {
            appState.pendingApproval = nil
            appState.showApprovalAlert = false
        }

        return approved
    }

    // MARK: - Tool Execution

    private func executeTool(name: String, arguments: [String: Any]) async throws -> [String: Any] {
        switch name {
        // -- App State --
        case "app_get_state":
            return try await executeAppGetState()

        // -- Navigation --
        case "nav_switch_tab":
            return try await executeNavSwitchTab(arguments)
        case "nav_list_tabs":
            return await executeNavListTabs()

        // -- Projects --
        case "project_list":
            return await executeProjectList()
        case "project_get_active":
            return await executeProjectGetActive()
        case "project_open":
            return try await executeProjectOpen(arguments)
        case "project_create":
            return try await executeProjectCreate(arguments)
        case "project_import":
            return try await executeProjectImport(arguments)
        case "project_close":
            return await executeProjectClose()

        // -- Simulator --
        case "simulator_list_devices":
            return await executeSimulatorListDevices()
        case "simulator_select_device":
            return try await executeSimulatorSelectDevice(arguments)
        case "simulator_start_streaming":
            return await executeSimulatorStartStreaming()
        case "simulator_stop_streaming":
            return await executeSimulatorStopStreaming()
        case "simulator_press_home":
            return try await executeSimulatorPressHome(arguments)
        case "simulator_send_text":
            return try await executeSimulatorSendText(arguments)
        case "simulator_toggle_keyboard":
            return await executeSimulatorToggleKeyboard()

        // -- Database --
        case "db_connect":
            return await executeDbConnect()
        case "db_disconnect":
            return await executeDbDisconnect()
        case "db_list_tables":
            return await executeDbListTables()
        case "db_select_table":
            return try await executeDbSelectTable(arguments)
        case "db_query_rows":
            return try await executeDbQueryRows(arguments)
        case "db_insert_record":
            return try await executeDbInsertRecord(arguments)
        case "db_update_record":
            return try await executeDbUpdateRecord(arguments)
        case "db_delete_record":
            return try await executeDbDeleteRecord(arguments)

        // -- Settings --
        case "settings_get":
            return await executeSettingsGet()
        case "settings_update":
            return await executeSettingsUpdate(arguments)
        case "settings_save":
            return await executeSettingsSave()

        // -- Recording --
        case "recording_start":
            return await executeRecordingStart()
        case "recording_stop":
            return await executeRecordingStop()

        // -- Tab State --
        case "get_tab_state":
            return try await executeGetTabState(arguments)

        // -- ASC Form Tools --
        case "asc_fill_form":
            return try await executeASCFillForm(arguments)
        case "asc_upload_screenshots":
            return try await executeASCUploadScreenshots(arguments)
        case "asc_open_submit_preview":
            return await executeASCOpenSubmitPreview()

        // -- Build Pipeline --
        case "app_store_setup_signing":
            return try await executeSetupSigning(arguments)
        case "app_store_build":
            return try await executeBuildIPA(arguments)
        case "app_store_upload":
            return try await executeUploadToTestFlight(arguments)

        // -- Device interaction (existing tools) --
        case "describe_screen":
            let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
            let udid = arguments["udid"] as? String ?? fallbackUdid ?? "booted"
            let result = try await deviceInteraction.execute(.describeAll(), udid: udid)
            return mcpText(result ?? "")

        case "device_action":
            guard let actionStr = arguments["action"] as? String,
                  let params = arguments["params"] as? [String: Any] else {
                throw MCPServerService.MCPError.invalidToolArgs
            }
            let action = try parseDeviceAction(actionStr, params: params)
            let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
            let udid = arguments["udid"] as? String ?? fallbackUdid ?? "booted"
            let result = try await deviceInteraction.execute(action, udid: udid)
            return mcpText(result ?? "Action executed")

        case "device_actions":
            guard let actions = arguments["actions"] as? [[String: Any]] else {
                throw MCPServerService.MCPError.invalidToolArgs
            }
            let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
            let udid = arguments["udid"] as? String ?? fallbackUdid ?? "booted"
            var results: [String] = []
            for actionDict in actions {
                guard let actionStr = actionDict["action"] as? String,
                      let params = actionDict["params"] as? [String: Any] else { continue }
                let action = try parseDeviceAction(actionStr, params: params)
                let result = try await deviceInteraction.execute(action, udid: udid)
                results.append(result ?? "OK")
            }
            return mcpText(results.joined(separator: "\n"))

        case "get_simulator_screenshot":
            let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
            let udid = arguments["udid"] as? String ?? fallbackUdid ?? "booted"
            let path = "/tmp/blitz-sim-screenshot-\(Int(Date().timeIntervalSince1970)).png"
            try await SimctlClient().screenshot(udid: udid, path: path)
            return mcpText(path)

        case "get_device_screenshot":
            let port = arguments["port"] as? Int ?? 8100
            let wda = WDAClient(port: port)
            // Try to reuse an existing session, or create a new one
            let sessionId: String
            if let sid = arguments["sessionId"] as? String {
                sessionId = sid
            } else {
                sessionId = try await wda.createSession()
            }
            let pngData = try await wda.screenshot(sessionId: sessionId)
            let path = "/tmp/blitz-device-screenshot-\(Int(Date().timeIntervalSince1970)).png"
            try pngData.write(to: URL(fileURLWithPath: path))
            return mcpText(path)

        case "get_blitz_screenshot":
            let path = "/tmp/blitz-app-screenshot-\(Int(Date().timeIntervalSince1970)).png"
            let saved = await MainActor.run { () -> Bool in
                guard let window = NSApp.windows.first(where: { $0.title != "Welcome to Blitz" && $0.canBecomeMain && $0.isVisible }) ?? NSApp.mainWindow else {
                    return false
                }
                let windowId = CGWindowID(window.windowNumber)
                guard let cgImage = CGWindowListCreateImage(
                    .null,
                    .optionIncludingWindow,
                    windowId,
                    [.boundsIgnoreFraming, .bestResolution]
                ) else {
                    return false
                }
                let bitmap = NSBitmapImageRep(cgImage: cgImage)
                guard let png = bitmap.representation(using: .png, properties: [:]) else {
                    return false
                }
                return ((try? png.write(to: URL(fileURLWithPath: path))) != nil)
            }
            if saved {
                return mcpText(path)
            } else {
                return mcpText("Error: could not capture Blitz window screenshot")
            }

        case "scan_ui":
            let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
            let udid = arguments["udid"] as? String ?? fallbackUdid ?? "booted"
            let result = try await deviceInteraction.execute(.describeAll(), udid: udid)
            return mcpText(result ?? "")

        default:
            throw MCPServerService.MCPError.unknownTool(name)
        }
    }

    // MARK: - App State Tools

    private func executeAppGetState() async throws -> [String: Any] {
        let state = await MainActor.run { () -> [String: Any] in
            var result: [String: Any] = [
                "activeTab": appState.activeTab.rawValue,
                "isStreaming": appState.simulatorStream.isCapturing,
                "isRecording": appState.recordingManager.isRecording
            ]
            if let project = appState.activeProject {
                result["activeProject"] = [
                    "id": project.id,
                    "name": project.name,
                    "path": project.path,
                    "type": project.type.rawValue
                ]
            }
            if let udid = appState.simulatorManager.bootedDeviceId {
                result["bootedSimulator"] = udid
            }
            return result
        }
        return mcpJSON(state)
    }

    // MARK: - Navigation Tools

    private func executeNavSwitchTab(_ args: [String: Any]) async throws -> [String: Any] {
        guard let tabStr = args["tab"] as? String,
              let tab = AppTab(rawValue: tabStr) else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        await MainActor.run { appState.activeTab = tab }

        // Auto-connect database when switching to database tab
        if tab == .database {
            let status = await MainActor.run { appState.databaseManager.connectionStatus }
            if status != .connected, let project = await MainActor.run(body: { appState.activeProject }) {
                await appState.databaseManager.startAndConnect(projectId: project.id, projectPath: project.path)
            }
        }

        return mcpText("Switched to tab: \(tab.label)")
    }

    private func executeNavListTabs() async -> [String: Any] {
        var groups: [[String: Any]] = []
        for group in AppTab.Group.allCases {
            let tabs = group.tabs.map { ["name": $0.rawValue, "label": $0.label, "icon": $0.icon] as [String: Any] }
            groups.append(["group": group.rawValue, "tabs": tabs])
        }
        // Include settings separately
        groups.append(["group": "Other", "tabs": [["name": "settings", "label": "Settings", "icon": "gear"]]])
        return mcpJSON(["groups": groups])
    }

    // MARK: - Project Tools

    private func executeProjectList() async -> [String: Any] {
        await appState.projectManager.loadProjects()
        let projects = await MainActor.run {
            appState.projectManager.projects.map { p -> [String: Any] in
                ["id": p.id, "name": p.name, "path": p.path, "type": p.type.rawValue]
            }
        }
        return mcpJSON(["projects": projects])
    }

    private func executeProjectGetActive() async -> [String: Any] {
        let result = await MainActor.run { () -> [String: Any]? in
            guard let project = appState.activeProject else { return nil }
            return ["id": project.id, "name": project.name, "path": project.path, "type": project.type.rawValue]
        }
        if let result {
            return mcpJSON(result)
        }
        return mcpText("No active project")
    }

    private func executeProjectOpen(_ args: [String: Any]) async throws -> [String: Any] {
        guard let projectId = args["projectId"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let storage = ProjectStorage()
        storage.updateLastOpened(projectId: projectId)
        await MainActor.run { appState.activeProjectId = projectId }
        await appState.projectManager.loadProjects()
        return mcpText("Opened project: \(projectId)")
    }

    private func executeProjectCreate(_ args: [String: Any]) async throws -> [String: Any] {
        guard let name = args["name"] as? String,
              let typeStr = args["type"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }

        let storage = ProjectStorage()
        let projectId = name.lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }
        let projectDir = storage.baseDirectory.appendingPathComponent(projectId)

        try FileManager.default.createDirectory(at: projectDir, withIntermediateDirectories: true)

        let projectType = ProjectType(rawValue: typeStr) ?? .blitz
        let metadata = BlitzProjectMetadata(
            name: name,
            type: projectType,
            createdAt: Date(),
            lastOpenedAt: Date()
        )
        try storage.writeMetadata(projectId: projectId, metadata: metadata)
        storage.ensureMCPConfig(projectId: projectId)
        await appState.projectManager.loadProjects()

        // Set pending setup so ContentView triggers warm template scaffolding
        await MainActor.run {
            appState.projectSetup.pendingSetupProjectId = projectId
            appState.activeProjectId = projectId
        }

        // Wait for setup to complete (ContentView picks up pendingSetupProjectId).
        // If the main window isn't open (WelcomeWindow's onChange should open it),
        // fall back to running setup directly.
        try? await Task.sleep(for: .seconds(2))
        let setupStarted = await MainActor.run { appState.projectSetup.isSettingUp }
        if !setupStarted {
            // ContentView didn't pick it up — run setup directly
            guard let project = await MainActor.run(body: { appState.activeProject }) else {
                return mcpText("Created project '\(name)' but could not start setup (project not found)")
            }
            await appState.projectSetup.setup(
                projectId: project.id,
                projectName: project.name,
                projectPath: project.path,
                projectType: project.type
            )
        } else {
            // Wait for setup to finish (up to 3 min)
            for _ in 0..<180 {
                let done = await MainActor.run { !appState.projectSetup.isSettingUp }
                if done { break }
                try? await Task.sleep(for: .seconds(1))
            }
        }

        let errorMsg = await MainActor.run { appState.projectSetup.errorMessage }
        if let errorMsg {
            return mcpText("Created project '\(name)' but setup failed: \(errorMsg)")
        }
        return mcpText("Created project '\(name)' (type: \(typeStr), id: \(projectId)) — setup complete")
    }

    private func executeProjectImport(_ args: [String: Any]) async throws -> [String: Any] {
        guard let path = args["path"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }

        let url = URL(fileURLWithPath: path)
        let storage = ProjectStorage()
        let projectId = try storage.openProject(at: url)
        storage.ensureMCPConfig(projectId: projectId)
        await appState.projectManager.loadProjects()
        await MainActor.run { appState.activeProjectId = projectId }

        return mcpText("Imported project from '\(path)' (id: \(projectId))")
    }

    private func executeProjectClose() async -> [String: Any] {
        await MainActor.run { appState.activeProjectId = nil }
        return mcpText("Project closed")
    }

    // MARK: - Simulator Tools

    private func executeSimulatorListDevices() async -> [String: Any] {
        await appState.simulatorManager.loadSimulators()
        let devices = await MainActor.run {
            appState.simulatorManager.simulators.map { sim -> [String: Any] in
                [
                    "udid": sim.udid,
                    "name": sim.name,
                    "state": sim.state,
                    "isBooted": sim.isBooted
                ]
            }
        }
        return mcpJSON(["devices": devices])
    }

    private func executeSimulatorSelectDevice(_ args: [String: Any]) async throws -> [String: Any] {
        guard let udid = args["udid"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }

        let service = SimulatorService()
        try await service.boot(udid: udid)
        await MainActor.run { appState.simulatorManager.bootedDeviceId = udid }
        await appState.simulatorManager.loadSimulators()

        return mcpText("Booted simulator: \(udid)")
    }

    private func executeSimulatorStartStreaming() async -> [String: Any] {
        let fps = await MainActor.run { appState.settingsStore.simulatorFPS }
        let udid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
        await appState.simulatorStream.startStreaming(bootedDeviceId: udid, fps: fps)
        return mcpText("Streaming started")
    }

    private func executeSimulatorStopStreaming() async -> [String: Any] {
        await appState.simulatorStream.stopStreaming()
        return mcpText("Streaming stopped")
    }

    private func executeSimulatorPressHome(_ args: [String: Any]) async throws -> [String: Any] {
        let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
        let udid = args["udid"] as? String ?? fallbackUdid ?? ""
        _ = try await deviceInteraction.execute(.button(.home), udid: udid)
        return mcpText("Home button pressed")
    }

    private func executeSimulatorSendText(_ args: [String: Any]) async throws -> [String: Any] {
        guard let text = args["text"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let fallbackUdid = await MainActor.run { appState.simulatorManager.bootedDeviceId }
        let udid = args["udid"] as? String ?? fallbackUdid ?? ""
        _ = try await deviceInteraction.execute(.inputText(text), udid: udid)
        return mcpText("Text sent: \(text)")
    }

    private func executeSimulatorToggleKeyboard() async -> [String: Any] {
        await MainActor.run {
            appState.simulatorStream.showTextInput.toggle()
        }
        return mcpText("Keyboard toggled")
    }

    // MARK: - Database Tools

    private func executeDbConnect() async -> [String: Any] {
        guard let project = await MainActor.run(body: { appState.activeProject }) else {
            return mcpText("No active project")
        }
        await appState.databaseManager.startAndConnect(projectId: project.id, projectPath: project.path)
        let status = await MainActor.run { appState.databaseManager.connectionStatus }
        return mcpText("Database connection status: \(status)")
    }

    private func executeDbDisconnect() async -> [String: Any] {
        await MainActor.run { appState.databaseManager.disconnect() }
        return mcpText("Database disconnected")
    }

    private func executeDbListTables() async -> [String: Any] {
        let tables = await MainActor.run {
            appState.databaseManager.schema?.tables.map { t -> [String: Any] in
                [
                    "name": t.name,
                    "fields": t.fields.map { ["name": $0.name, "type": $0.type ?? "text"] }
                ]
            } ?? []
        }
        return mcpJSON(["tables": tables])
    }

    private func executeDbSelectTable(_ args: [String: Any]) async throws -> [String: Any] {
        guard let tableName = args["table"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let found = await MainActor.run { () -> Bool in
            guard let table = appState.databaseManager.schema?.tables.first(where: { $0.name == tableName }) else {
                return false
            }
            appState.databaseManager.selectedTable = table
            return true
        }
        return mcpText(found ? "Selected table: \(tableName)" : "Table not found: \(tableName)")
    }

    private func executeDbQueryRows(_ args: [String: Any]) async throws -> [String: Any] {
        if let tableName = args["table"] as? String {
            _ = try await executeDbSelectTable(["table": tableName])
        }
        if let search = args["search"] as? String {
            await MainActor.run { appState.databaseManager.searchText = search }
        }
        if let orderBy = args["orderBy"] as? String {
            await MainActor.run { appState.databaseManager.sortField = orderBy }
        }
        if let ascending = args["ascending"] as? Bool {
            await MainActor.run { appState.databaseManager.sortAscending = ascending }
        }
        if let limit = args["limit"] as? Int {
            await MainActor.run { appState.databaseManager.pageSize = limit }
        }
        if let offset = args["offset"] as? Int {
            let pageSize = await MainActor.run { appState.databaseManager.pageSize }
            await MainActor.run { appState.databaseManager.currentPage = offset / max(pageSize, 1) }
        }

        await appState.databaseManager.loadRows()

        let result = await MainActor.run { () -> [String: Any] in
            let jsonRows: [[String: Any]] = appState.databaseManager.rows.map { row in
                row.mapValues { value -> Any in
                    switch value {
                    case .string(let v): return v
                    case .int(let v): return v
                    case .double(let v): return v
                    case .bool(let v): return v
                    case .null: return NSNull()
                    }
                }
            }
            return [
                "rows": jsonRows,
                "total": appState.databaseManager.totalRows,
                "page": appState.databaseManager.currentPage,
                "pageSize": appState.databaseManager.pageSize
            ]
        }
        return mcpJSON(result)
    }

    private func executeDbInsertRecord(_ args: [String: Any]) async throws -> [String: Any] {
        guard let values = args["values"] as? [String: Any] else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let status = await MainActor.run { appState.databaseManager.connectionStatus }
        guard status == .connected else {
            return mcpText("Error: database is not connected. Call db_connect first.")
        }
        if let tableName = args["table"] as? String {
            _ = try await executeDbSelectTable(["table": tableName])
        }
        let tableName = await MainActor.run { appState.databaseManager.selectedTable?.name }
        guard let tableName else {
            return mcpText("Error: no table selected. Provide a 'table' parameter or call db_select_table first.")
        }
        do {
            _ = try await appState.databaseManager.client.insertRecord(table: tableName, values: values)
            await appState.databaseManager.loadRows()
            return mcpText("Record inserted")
        } catch {
            return mcpText("Error inserting record: \(error.localizedDescription)")
        }
    }

    private func executeDbUpdateRecord(_ args: [String: Any]) async throws -> [String: Any] {
        guard let id = args["id"] as? String,
              let values = args["values"] as? [String: Any] else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let status = await MainActor.run { appState.databaseManager.connectionStatus }
        guard status == .connected else {
            return mcpText("Error: database is not connected. Call db_connect first.")
        }
        if let tableName = args["table"] as? String {
            _ = try await executeDbSelectTable(["table": tableName])
        }
        let tableName = await MainActor.run { appState.databaseManager.selectedTable?.name }
        guard let tableName else {
            return mcpText("Error: no table selected. Provide a 'table' parameter or call db_select_table first.")
        }
        do {
            _ = try await appState.databaseManager.client.updateRecord(table: tableName, id: id, values: values)
            await appState.databaseManager.loadRows()
            return mcpText("Record updated")
        } catch {
            return mcpText("Error updating record: \(error.localizedDescription)")
        }
    }

    private func executeDbDeleteRecord(_ args: [String: Any]) async throws -> [String: Any] {
        guard let id = args["id"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let status = await MainActor.run { appState.databaseManager.connectionStatus }
        guard status == .connected else {
            return mcpText("Error: database is not connected. Call db_connect first.")
        }
        if let tableName = args["table"] as? String {
            _ = try await executeDbSelectTable(["table": tableName])
        }
        let tableName = await MainActor.run { appState.databaseManager.selectedTable?.name }
        guard let tableName else {
            return mcpText("Error: no table selected. Provide a 'table' parameter or call db_select_table first.")
        }
        do {
            _ = try await appState.databaseManager.client.deleteRecord(table: tableName, id: id)
            await appState.databaseManager.loadRows()
            return mcpText("Record deleted")
        } catch {
            return mcpText("Error deleting record: \(error.localizedDescription)")
        }
    }

    // MARK: - Settings Tools

    private func executeSettingsGet() async -> [String: Any] {
        let settings = await MainActor.run { () -> [String: Any] in
            [
                "simulatorFPS": appState.settingsStore.simulatorFPS,
                "showCursor": appState.settingsStore.showCursor,
                "cursorSize": appState.settingsStore.cursorSize,
                "recordingFormat": appState.settingsStore.recordingFormat,
                "defaultSimulatorUDID": appState.settingsStore.defaultSimulatorUDID ?? ""
            ]
        }
        return mcpJSON(settings)
    }

    private func executeSettingsUpdate(_ args: [String: Any]) async -> [String: Any] {
        await MainActor.run {
            if let fps = args["simulatorFPS"] as? Int { appState.settingsStore.simulatorFPS = fps }
            if let cursor = args["showCursor"] as? Bool { appState.settingsStore.showCursor = cursor }
            if let size = args["cursorSize"] as? Double { appState.settingsStore.cursorSize = size }
            if let format = args["recordingFormat"] as? String { appState.settingsStore.recordingFormat = format }
        }
        return mcpText("Settings updated")
    }

    private func executeSettingsSave() async -> [String: Any] {
        await MainActor.run { appState.settingsStore.save() }
        return mcpText("Settings saved to disk")
    }

    // MARK: - Recording Tools

    private func executeRecordingStart() async -> [String: Any] {
        await MainActor.run { appState.recordingManager.isRecording = true }
        return mcpText("Recording started")
    }

    private func executeRecordingStop() async -> [String: Any] {
        await MainActor.run { appState.recordingManager.isRecording = false }
        return mcpText("Recording stopped")
    }

    // MARK: - ASC Form Tools

    // Valid field names per tab — rejects unknown fields before API roundtrip
    private static let validFieldsByTab: [String: Set<String>] = [
        "storeListing": ["title", "name", "subtitle", "description", "keywords", "promotionalText",
                         "marketingUrl", "supportUrl", "whatsNew", "privacyPolicyUrl"],
        "appDetails": ["copyright", "primaryCategory", "contentRightsDeclaration"],
        "pricing": ["isFree"],
        "review.ageRating": ["gambling", "messagingAndChat", "unrestrictedWebAccess",
                             "userGeneratedContent", "advertising", "lootBox",
                             "healthOrWellnessTopics", "parentalControls", "ageAssurance",
                             "alcoholTobaccoOrDrugUseOrReferences", "contests", "gamblingSimulated",
                             "gunsOrOtherWeapons", "horrorOrFearThemes", "matureOrSuggestiveThemes",
                             "medicalOrTreatmentInformation", "profanityOrCrudeHumor",
                             "sexualContentGraphicAndNudity", "sexualContentOrNudity",
                             "violenceCartoonOrFantasy", "violenceRealistic",
                             "violenceRealisticProlongedGraphicOrSadistic"],
        "review.contact": ["contactFirstName", "contactLastName", "contactEmail", "contactPhone",
                           "notes", "demoAccountRequired", "demoAccountName", "demoAccountPassword"],
        "settings.bundleId": ["bundleId"],
    ]

    // Common aliases: user-friendly field names → API field names (per tab)
    private static let fieldAliases: [String: String] = [
        "firstName": "contactFirstName",
        "lastName": "contactLastName",
        "email": "contactEmail",
        "phone": "contactPhone",
    ]

    private func executeASCFillForm(_ args: [String: Any]) async throws -> [String: Any] {
        guard let tab = args["tab"] as? String,
              let fieldsArray = args["fields"] as? [[String: Any]] else {
            throw MCPServerService.MCPError.invalidToolArgs
        }

        // Build field map with alias resolution
        var fieldMap: [String: String] = [:]
        for item in fieldsArray {
            if let field = item["field"] as? String, let value = item["value"] as? String {
                let resolved = Self.fieldAliases[field] ?? field
                fieldMap[resolved] = value
            }
        }

        // Validate field names against allowed set for this tab
        if let validFields = Self.validFieldsByTab[tab] {
            let invalid = fieldMap.keys.filter { !validFields.contains($0) }
            if !invalid.isEmpty {
                // Check if the field belongs to a different tab
                var hints: [String] = []
                for field in invalid {
                    for (otherTab, otherFields) in Self.validFieldsByTab where otherTab != tab {
                        if otherFields.contains(field) {
                            hints.append("'\(field)' belongs on tab '\(otherTab)'")
                        }
                    }
                }
                let hintStr = hints.isEmpty ? "" : " Hint: \(hints.joined(separator: "; "))."
                return mcpText("Error: invalid field(s) for tab '\(tab)': \(invalid.sorted().joined(separator: ", ")). Valid fields: \(validFields.sorted().joined(separator: ", ")).\(hintStr)")
            }
        }

        // Navigation + pending values already set by preNavigateASCTool in execute()

        // Execute the write based on tab
        switch tab {
        case "storeListing":
            // Fields are split across two ASC resources:
            // - appInfoLocalizations: name (title), subtitle, privacyPolicyUrl
            // - appStoreVersionLocalizations: description, keywords, whatsNew, marketingUrl, supportUrl, promotionalText
            let appInfoLocFields: Set<String> = ["name", "title", "subtitle", "privacyPolicyUrl"]
            var versionLocFields: [String: String] = [:]
            var infoLocFields: [String: String] = [:]

            for (field, value) in fieldMap {
                if appInfoLocFields.contains(field) {
                    // Map "title" to "name" for the API
                    let apiField = (field == "title") ? "name" : field
                    infoLocFields[apiField] = value
                } else {
                    versionLocFields[field] = value
                }
            }

            // Save appInfoLocalization fields (name, subtitle, privacyPolicyUrl)
            if !infoLocFields.isEmpty {
                for (field, value) in infoLocFields {
                    await appState.ascManager.updateAppInfoLocalizationField(field, value: value)
                }
                // Check if any write failed
                if let error = await MainActor.run(body: { appState.ascManager.writeError }) {
                    _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }
                    return mcpText("Error updating store listing: \(error)")
                }
            }

            // Save version localization fields (description, keywords, etc.)
            if !versionLocFields.isEmpty {
                guard let locId = await MainActor.run(body: { appState.ascManager.localizations.first?.id }) else {
                    return mcpText("Error: no version localizations found.")
                }
                do {
                    guard let service = await MainActor.run(body: { appState.ascManager.service }) else {
                        return mcpText("Error: ASC service not configured")
                    }
                    try await service.patchLocalization(id: locId, fields: versionLocFields)
                    if let versionId = await MainActor.run(body: { appState.ascManager.appStoreVersions.first?.id }) {
                        let locs = try await service.fetchLocalizations(versionId: versionId)
                        await MainActor.run { appState.ascManager.localizations = locs }
                    }
                } catch {
                    _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }
                    return mcpText("Error updating store listing: \(error.localizedDescription)")
                }
            }

        case "appDetails":
            for (field, value) in fieldMap {
                await appState.ascManager.updateAppInfoField(field, value: value)
            }
            if let error = await MainActor.run(body: { appState.ascManager.writeError }) {
                _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }
                return mcpText("Error updating app details: \(error)")
            }

        case "pricing":
            guard let isFree = fieldMap["isFree"] else {
                return mcpText("Error: pricing tab requires the 'isFree' field (value: \"true\" or \"false\").")
            }
            if isFree == "true" {
                await appState.ascManager.setPriceFree()
            } else {
                return mcpText("Error: only free pricing is supported via MCP. Set paid pricing manually in App Store Connect.")
            }
            if let error = await MainActor.run(body: { appState.ascManager.writeError }) {
                _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }
                return mcpText("Error updating pricing: \(error)")
            }

        case "review.ageRating":
            var attrs: [String: Any] = [:]
            let boolFields = Set(["gambling", "messagingAndChat", "unrestrictedWebAccess",
                                  "userGeneratedContent", "advertising", "lootBox",
                                  "healthOrWellnessTopics", "parentalControls", "ageAssurance"])
            for (field, value) in fieldMap {
                if boolFields.contains(field) {
                    attrs[field] = value == "true"
                } else {
                    attrs[field] = value
                }
            }
            await appState.ascManager.updateAgeRating(attrs)
            if let error = await MainActor.run(body: { appState.ascManager.writeError }) {
                _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }
                return mcpText("Error updating age rating: \(error)")
            }

        case "review.contact":
            var attrs: [String: Any] = [:]
            for (field, value) in fieldMap {
                if field == "demoAccountRequired" {
                    attrs[field] = value == "true"
                } else {
                    attrs[field] = value
                }
            }
            await appState.ascManager.updateReviewContact(attrs)
            if let error = await MainActor.run(body: { appState.ascManager.writeError }) {
                _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }
                return mcpText("Error updating review contact: \(error)")
            }

        case "settings.bundleId":
            if let bundleId = fieldMap["bundleId"] {
                let projectPath = await MainActor.run { appState.activeProject?.path }
                await MainActor.run {
                    guard let projectId = appState.activeProjectId else { return }
                    let storage = ProjectStorage()
                    guard var metadata = storage.readMetadata(projectId: projectId) else { return }
                    metadata.bundleIdentifier = bundleId
                    try? storage.writeMetadata(projectId: projectId, metadata: metadata)
                }
                // Also update PRODUCT_BUNDLE_IDENTIFIER in pbxproj
                if let projectPath {
                    let pipeline = BuildPipelineService()
                    await pipeline.updateBundleIdInPbxproj(projectPath: projectPath, bundleId: bundleId)
                }
                await appState.projectManager.loadProjects()
                let hasCreds = await MainActor.run { appState.ascManager.credentials != nil }
                if hasCreds {
                    await appState.ascManager.fetchApp(bundleId: bundleId)
                }
            }

        default:
            return mcpText("Unknown tab: \(tab)")
        }

        // Clear pending values
        _ = await MainActor.run { appState.ascManager.pendingFormValues.removeValue(forKey: tab) }

        return mcpJSON(["success": true, "tab": tab, "fieldsUpdated": fieldMap.count])
    }

    private func executeASCUploadScreenshots(_ args: [String: Any]) async throws -> [String: Any] {
        guard let rawPaths = args["screenshotPaths"] as? [String],
              let displayType = args["displayType"] as? String else {
            throw MCPServerService.MCPError.invalidToolArgs
        }
        let locale = args["locale"] as? String ?? "en-US"

        // Expand ~ and validate paths exist
        let paths = rawPaths.map { ($0 as NSString).expandingTildeInPath }
        for path in paths {
            guard FileManager.default.fileExists(atPath: path) else {
                return mcpText("Error: file not found at \(path)")
            }
        }

        await appState.ascManager.uploadScreenshots(paths: paths, displayType: displayType, locale: locale)

        if let error = await MainActor.run(body: { appState.ascManager.writeError }) {
            return mcpText("Error uploading screenshots: \(error)")
        }
        return mcpJSON(["success": true, "uploaded": paths.count])
    }

    private func executeASCOpenSubmitPreview() async -> [String: Any] {
        // Navigation already done by preNavigateASCTool
        var readiness = await MainActor.run { appState.ascManager.submissionReadiness }

        // If Build is the only (or one of the) missing fields, try to auto-attach
        let buildMissing = readiness.missingRequired.contains { $0.label == "Build" }
        if buildMissing {
            // Refresh builds list from ASC
            let service = await MainActor.run { appState.ascManager.service }
            let appId = await MainActor.run { appState.ascManager.app?.id }
            if let service, let appId {
                // Fetch latest builds
                if let latestBuild = try? await service.fetchLatestBuild(appId: appId),
                   latestBuild.attributes.processingState == "VALID" {
                    // Find the pending version to attach to
                    let versionId = await MainActor.run { () -> String? in
                        appState.ascManager.appStoreVersions.first {
                            let s = $0.attributes.appStoreState ?? ""
                            return s != "READY_FOR_SALE" && s != "REMOVED_FROM_SALE"
                                && s != "DEVELOPER_REMOVED_FROM_SALE" && !s.isEmpty
                        }?.id ?? appState.ascManager.appStoreVersions.first?.id
                    }
                    if let versionId {
                        do {
                            try await service.attachBuild(versionId: versionId, buildId: latestBuild.id)
                            // Refresh data so readiness reflects the attached build
                            await appState.ascManager.fetchTabData(.ascOverview)
                            readiness = await MainActor.run { appState.ascManager.submissionReadiness }
                        } catch {
                            // Non-fatal: report in missing fields
                        }
                    }
                }
            }
        }

        if !readiness.isComplete {
            let missing = readiness.missingRequired.map { $0.label }
            return mcpJSON(["ready": false, "missing": missing])
        }

        await MainActor.run {
            appState.ascManager.showSubmitPreview = true
        }

        return mcpJSON(["ready": true, "opened": true])
    }

    // MARK: - Tab State Tool

    private func executeGetTabState(_ args: [String: Any]) async throws -> [String: Any] {
        let tabStr = args["tab"] as? String
        let tab: AppTab
        if let tabStr, let parsed = AppTab(rawValue: tabStr) {
            tab = parsed
        } else {
            tab = await MainActor.run { appState.activeTab }
        }

        // Build base result on main actor
        var result = await MainActor.run { () -> [String: Any] in
            let asc = appState.ascManager
            var r: [String: Any] = [
                "tab": tab.rawValue,
                "isLoading": asc.isLoadingTab[tab] ?? false,
            ]
            if let error = asc.tabError[tab] { r["error"] = error }
            if let writeErr = asc.writeError { r["writeError"] = writeErr }
            if tab.isASCTab, let app = asc.app {
                r["app"] = ["id": app.id, "name": app.name, "bundleId": app.bundleId] as [String: Any]
            }
            return r
        }

        // Build tab-specific data
        let projectId = appState.activeProjectId
        let tabData = await MainActor.run { () -> [String: Any] in
            tabStateData(for: tab, asc: appState.ascManager, projectId: projectId)
        }
        for (key, value) in tabData {
            result[key] = value
        }

        return mcpJSON(result)
    }

    /// Extract tab-specific state data. Must be called on MainActor.
    @MainActor
    private func tabStateData(for tab: AppTab, asc: ASCManager, projectId: String?) -> [String: Any] {
        switch tab {
        case .ascOverview:
            if let pid = projectId {
                asc.checkAppIcon(projectId: pid)
            }
            return tabStateASCOverview(asc)
        case .storeListing:
            return tabStateStoreListing(asc)
        case .appDetails:
            return tabStateAppDetails(asc)
        case .review:
            return tabStateReview(asc)
        case .screenshots:
            return tabStateScreenshots(asc)
        case .reviews:
            return tabStateReviews(asc)
        case .builds:
            return tabStateBuilds(asc)
        case .groups:
            return tabStateGroups(asc)
        case .betaInfo:
            return tabStateBetaInfo(asc)
        case .feedback:
            return tabStateFeedback(asc)
        default:
            return ["note": "No structured state available for this tab"]
        }
    }

    @MainActor
    private func tabStateASCOverview(_ asc: ASCManager) -> [String: Any] {
        let readiness = asc.submissionReadiness
        var fields: [[String: Any]] = []
        for f in readiness.fields {
            let filled = f.value != nil && !f.value!.isEmpty
            fields.append(["label": f.label, "value": f.value as Any, "required": f.required, "filled": filled])
        }
        var r: [String: Any] = [
            "submissionReadiness": [
                "isComplete": readiness.isComplete,
                "fields": fields,
                "missingRequired": readiness.missingRequired.map { $0.label }
            ] as [String: Any],
            "totalVersions": asc.appStoreVersions.count
        ]
        if let v = asc.appStoreVersions.first {
            r["latestVersion"] = ["id": v.id, "versionString": v.attributes.versionString, "state": v.attributes.appStoreState ?? "unknown"] as [String: Any]
        }
        return r
    }

    @MainActor
    private func tabStateStoreListing(_ asc: ASCManager) -> [String: Any] {
        let loc = asc.localizations.first
        let infoLoc = asc.appInfoLocalization
        return [
            "localization": [
                "locale": loc?.attributes.locale ?? "",
                "name": infoLoc?.attributes.name ?? loc?.attributes.title ?? "",
                "subtitle": infoLoc?.attributes.subtitle ?? loc?.attributes.subtitle ?? "",
                "description": loc?.attributes.description ?? "",
                "keywords": loc?.attributes.keywords ?? "",
                "promotionalText": loc?.attributes.promotionalText ?? "",
                "marketingUrl": loc?.attributes.marketingUrl ?? "",
                "supportUrl": loc?.attributes.supportUrl ?? "",
                "whatsNew": loc?.attributes.whatsNew ?? ""
            ] as [String: Any],
            "privacyPolicyUrl": infoLoc?.attributes.privacyPolicyUrl ?? "",
            "localeCount": asc.localizations.count
        ]
    }

    @MainActor
    private func tabStateAppDetails(_ asc: ASCManager) -> [String: Any] {
        var r: [String: Any] = [
            "appInfo": [
                "primaryCategory": asc.appInfo?.primaryCategoryId ?? "",
                "contentRightsDeclaration": asc.app?.contentRightsDeclaration ?? ""
            ] as [String: Any],
            "versionCount": asc.appStoreVersions.count
        ]
        if let v = asc.appStoreVersions.first {
            r["latestVersion"] = ["versionString": v.attributes.versionString, "state": v.attributes.appStoreState ?? "unknown"] as [String: Any]
        }
        return r
    }

    @MainActor
    private func tabStateReview(_ asc: ASCManager) -> [String: Any] {
        var r: [String: Any] = [:]

        if let ar = asc.ageRatingDeclaration {
            let a = ar.attributes
            var arDict: [String: Any] = ["id": ar.id]
            arDict["gambling"] = a.gambling ?? false
            arDict["messagingAndChat"] = a.messagingAndChat ?? false
            arDict["unrestrictedWebAccess"] = a.unrestrictedWebAccess ?? false
            arDict["userGeneratedContent"] = a.userGeneratedContent ?? false
            arDict["advertising"] = a.advertising ?? false
            arDict["lootBox"] = a.lootBox ?? false
            arDict["healthOrWellnessTopics"] = a.healthOrWellnessTopics ?? false
            arDict["parentalControls"] = a.parentalControls ?? false
            arDict["ageAssurance"] = a.ageAssurance ?? false
            arDict["alcoholTobaccoOrDrugUseOrReferences"] = a.alcoholTobaccoOrDrugUseOrReferences ?? "NONE"
            arDict["contests"] = a.contests ?? "NONE"
            arDict["gamblingSimulated"] = a.gamblingSimulated ?? "NONE"
            arDict["gunsOrOtherWeapons"] = a.gunsOrOtherWeapons ?? "NONE"
            arDict["horrorOrFearThemes"] = a.horrorOrFearThemes ?? "NONE"
            arDict["matureOrSuggestiveThemes"] = a.matureOrSuggestiveThemes ?? "NONE"
            arDict["medicalOrTreatmentInformation"] = a.medicalOrTreatmentInformation ?? "NONE"
            arDict["profanityOrCrudeHumor"] = a.profanityOrCrudeHumor ?? "NONE"
            arDict["sexualContentGraphicAndNudity"] = a.sexualContentGraphicAndNudity ?? "NONE"
            arDict["sexualContentOrNudity"] = a.sexualContentOrNudity ?? "NONE"
            arDict["violenceCartoonOrFantasy"] = a.violenceCartoonOrFantasy ?? "NONE"
            arDict["violenceRealistic"] = a.violenceRealistic ?? "NONE"
            arDict["violenceRealisticProlongedGraphicOrSadistic"] = a.violenceRealisticProlongedGraphicOrSadistic ?? "NONE"
            r["ageRating"] = arDict
        }

        if let rd = asc.reviewDetail {
            let a = rd.attributes
            r["reviewContact"] = [
                "contactFirstName": a.contactFirstName ?? "",
                "contactLastName": a.contactLastName ?? "",
                "contactEmail": a.contactEmail ?? "",
                "contactPhone": a.contactPhone ?? "",
                "notes": a.notes ?? "",
                "demoAccountRequired": a.demoAccountRequired ?? false,
                "demoAccountName": a.demoAccountName ?? "",
                "demoAccountPassword": a.demoAccountPassword ?? ""
            ] as [String: Any]
        }

        r["builds"] = asc.builds.prefix(10).map { b -> [String: Any] in
            ["id": b.id, "version": b.attributes.version, "processingState": b.attributes.processingState ?? "unknown", "uploadedDate": b.attributes.uploadedDate ?? ""]
        }
        return r
    }

    @MainActor
    private func tabStateScreenshots(_ asc: ASCManager) -> [String: Any] {
        let sets = asc.screenshotSets.map { s -> [String: Any] in
            var set: [String: Any] = ["id": s.id, "displayType": s.attributes.screenshotDisplayType]
            if let shots = asc.screenshots[s.id] {
                set["screenshotCount"] = shots.count
                set["screenshots"] = shots.map { ["id": $0.id, "fileName": $0.attributes.fileName ?? ""] as [String: Any] }
            }
            return set
        }
        return ["screenshotSets": sets, "localeCount": asc.localizations.count]
    }

    @MainActor
    private func tabStateReviews(_ asc: ASCManager) -> [String: Any] {
        let reviews = asc.customerReviews.prefix(20).map { r -> [String: Any] in
            ["id": r.id, "title": r.attributes.title ?? "", "body": r.attributes.body ?? "", "rating": r.attributes.rating, "reviewerNickname": r.attributes.reviewerNickname ?? ""]
        }
        return ["reviews": reviews, "totalReviews": asc.customerReviews.count]
    }

    @MainActor
    private func tabStateBuilds(_ asc: ASCManager) -> [String: Any] {
        let builds = asc.builds.prefix(20).map { b -> [String: Any] in
            ["id": b.id, "version": b.attributes.version, "processingState": b.attributes.processingState ?? "unknown", "uploadedDate": b.attributes.uploadedDate ?? ""]
        }
        return ["builds": builds]
    }

    @MainActor
    private func tabStateGroups(_ asc: ASCManager) -> [String: Any] {
        let groups = asc.betaGroups.map { g -> [String: Any] in
            ["id": g.id, "name": g.attributes.name, "isInternalGroup": g.attributes.isInternalGroup ?? false]
        }
        return ["betaGroups": groups]
    }

    @MainActor
    private func tabStateBetaInfo(_ asc: ASCManager) -> [String: Any] {
        let locs = asc.betaLocalizations.map { l -> [String: Any] in
            ["id": l.id, "locale": l.attributes.locale, "description": l.attributes.description ?? ""]
        }
        return ["betaLocalizations": locs]
    }

    @MainActor
    private func tabStateFeedback(_ asc: ASCManager) -> [String: Any] {
        var items: [[String: Any]] = []
        for (buildId, feedbackItems) in asc.betaFeedback {
            for item in feedbackItems {
                items.append(["buildId": buildId, "id": item.id, "comment": item.attributes.comment ?? "", "timestamp": item.attributes.timestamp ?? ""])
            }
        }
        return ["feedback": items, "selectedBuildId": asc.selectedBuildId ?? ""]
    }

    // MARK: - Build Pipeline Tools

    private func executeSetupSigning(_ args: [String: Any]) async throws -> [String: Any] {
        // Validate project and credentials
        guard let project = await MainActor.run(body: { appState.activeProject }) else {
            return mcpText("Error: no active project. Open a project first.")
        }
        guard let service = await MainActor.run(body: { appState.ascManager.service }) else {
            return mcpText("Error: ASC credentials not configured. Set up App Store Connect credentials first.")
        }

        // Resolve bundle ID
        let bundleId = await MainActor.run { () -> String? in
            let storage = ProjectStorage()
            return storage.readMetadata(projectId: project.id)?.bundleIdentifier
        }
        guard let bundleId, !bundleId.isEmpty else {
            return mcpText("Error: no bundle identifier set. Use asc_fill_form tab=settings.bundleId to set it first.")
        }

        // Cross-validate: if an ASC app is loaded, ensure bundle IDs match
        let ascBundleId = await MainActor.run { appState.ascManager.app?.bundleId }
        if let ascBundleId, !ascBundleId.isEmpty, ascBundleId != bundleId {
            return mcpText("Error: bundle ID mismatch. Project has '\(bundleId)' but the active App Store Connect app uses '\(ascBundleId)'. Update the bundle ID via asc_fill_form tab=settings.bundleId field=bundleId value=\(ascBundleId)")
        }

        // Resolve team ID from args, project metadata, or nil
        let savedTeamId = await MainActor.run { () -> String? in
            let storage = ProjectStorage()
            return storage.readMetadata(projectId: project.id)?.teamId
        }
        let teamId = args["teamId"] as? String ?? savedTeamId

        await MainActor.run {
            appState.ascManager.buildPipelinePhase = .signingSetup
            appState.ascManager.buildPipelineMessage = "Setting up signing…"
        }

        let pipeline = BuildPipelineService()
        let appStateRef = appState
        do {
            // Run with 5-minute overall timeout to prevent silent hangs
            let result = try await withThrowingTimeout(seconds: 300) {
                try await pipeline.setupSigning(
                    projectPath: project.path,
                    bundleId: bundleId,
                    teamId: teamId,
                    ascService: service,
                    onProgress: { msg in
                        Task { @MainActor in
                            appStateRef.ascManager.buildPipelineMessage = msg
                        }
                    }
                )
            }

            // Persist teamId to project metadata on success
            if !result.teamId.isEmpty {
                await MainActor.run {
                    let storage = ProjectStorage()
                    guard var metadata = storage.readMetadata(projectId: project.id) else { return }
                    metadata.teamId = result.teamId
                    try? storage.writeMetadata(projectId: project.id, metadata: metadata)
                }
            }

            await MainActor.run {
                appState.ascManager.buildPipelinePhase = .idle
                appState.ascManager.buildPipelineMessage = ""
            }

            return mcpJSON([
                "success": true,
                "bundleIdResourceId": result.bundleIdResourceId,
                "certificateId": result.certificateId,
                "profileUUID": result.profileUUID,
                "teamId": result.teamId,
                "log": result.log
            ] as [String: Any])
        } catch {
            await MainActor.run {
                appState.ascManager.buildPipelinePhase = .idle
                appState.ascManager.buildPipelineMessage = ""
            }
            return mcpText("Error in signing setup: \(error.localizedDescription)")
        }
    }

    private func executeBuildIPA(_ args: [String: Any]) async throws -> [String: Any] {
        guard let project = await MainActor.run(body: { appState.activeProject }) else {
            return mcpText("Error: no active project.")
        }

        let bundleId = await MainActor.run { () -> String? in
            let storage = ProjectStorage()
            return storage.readMetadata(projectId: project.id)?.bundleIdentifier
        }
        guard let bundleId, !bundleId.isEmpty else {
            return mcpText("Error: no bundle identifier set.")
        }

        // Cross-validate bundle ID against active ASC app
        let ascBundleId = await MainActor.run { appState.ascManager.app?.bundleId }
        if let ascBundleId, !ascBundleId.isEmpty, ascBundleId != bundleId {
            return mcpText("Error: bundle ID mismatch. Project has '\(bundleId)' but App Store Connect app uses '\(ascBundleId)'. Update via asc_fill_form tab=settings.bundleId field=bundleId value=\(ascBundleId)")
        }

        let teamId = await MainActor.run { () -> String? in
            let storage = ProjectStorage()
            return storage.readMetadata(projectId: project.id)?.teamId
        }
        guard let teamId, !teamId.isEmpty else {
            return mcpText("Error: no team ID set. Run app_store_setup_signing first.")
        }

        let scheme = args["scheme"] as? String
        let configuration = args["configuration"] as? String

        await MainActor.run {
            appState.ascManager.buildPipelinePhase = .archiving
            appState.ascManager.buildPipelineMessage = "Starting build…"
        }

        let pipeline = BuildPipelineService()
        let appStateRef = appState
        do {
            let result = try await pipeline.buildIPA(
                projectPath: project.path,
                bundleId: bundleId,
                teamId: teamId,
                scheme: scheme,
                configuration: configuration,
                onProgress: { msg in
                    Task { @MainActor in
                        // Detect phase transitions from build output
                        if msg.contains("ARCHIVE SUCCEEDED") || msg.contains("-exportArchive") {
                            appStateRef.ascManager.buildPipelinePhase = .exporting
                        }
                        appStateRef.ascManager.buildPipelineMessage = String(msg.prefix(120))
                    }
                }
            )

            await MainActor.run {
                appState.ascManager.buildPipelinePhase = .idle
                appState.ascManager.buildPipelineMessage = ""
            }

            return mcpJSON([
                "success": true,
                "ipaPath": result.ipaPath,
                "archivePath": result.archivePath,
                "log": result.log
            ] as [String: Any])
        } catch {
            await MainActor.run {
                appState.ascManager.buildPipelinePhase = .idle
                appState.ascManager.buildPipelineMessage = ""
            }
            return mcpText("Error building IPA: \(error.localizedDescription)")
        }
    }

    private func executeUploadToTestFlight(_ args: [String: Any]) async throws -> [String: Any] {
        guard await MainActor.run(body: { appState.activeProject }) != nil else {
            return mcpText("Error: no active project.")
        }
        guard let credentials = await MainActor.run(body: { appState.ascManager.credentials }) else {
            return mcpText("Error: ASC credentials not configured.")
        }

        // Resolve IPA path
        let ipaPath: String
        if let path = args["ipaPath"] as? String {
            ipaPath = (path as NSString).expandingTildeInPath
        } else {
            // Try to find most recent IPA in /tmp
            let tmpURL = URL(fileURLWithPath: NSTemporaryDirectory())
            let tmpContents = try FileManager.default.contentsOfDirectory(at: tmpURL, includingPropertiesForKeys: [.contentModificationDateKey])
            let exportDirs = tmpContents.filter { $0.lastPathComponent.hasPrefix("BlitzExport-") }
                .sorted { a, b in
                    let aDate = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                    let bDate = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                    return aDate > bDate
                }
            var foundIPA: String?
            for dir in exportDirs {
                let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
                if let ipa = files.first(where: { $0.pathExtension == "ipa" }) {
                    foundIPA = ipa.path
                    break
                }
            }
            guard let found = foundIPA else {
                return mcpText("Error: no IPA path provided and no recent build found. Run app_store_build first.")
            }
            ipaPath = found
        }

        guard FileManager.default.fileExists(atPath: ipaPath) else {
            return mcpText("Error: IPA not found at \(ipaPath)")
        }

        let skipPolling = args["skipPolling"] as? Bool ?? false

        // Get app ID for polling
        let appId = await MainActor.run { appState.ascManager.app?.id }
        let service = await MainActor.run { appState.ascManager.service }

        await MainActor.run {
            appState.ascManager.buildPipelinePhase = .uploading
            appState.ascManager.buildPipelineMessage = "Uploading IPA…"
        }

        let pipeline = BuildPipelineService()
        let appStateRef = appState
        do {
            let result = try await pipeline.uploadToTestFlight(
                ipaPath: ipaPath,
                keyId: credentials.keyId,
                issuerId: credentials.issuerId,
                privateKeyPEM: credentials.privateKey,
                appId: appId,
                ascService: service,
                skipPolling: skipPolling,
                onProgress: { msg in
                    Task { @MainActor in
                        if msg.contains("Poll") {
                            appStateRef.ascManager.buildPipelinePhase = .processing
                        }
                        appStateRef.ascManager.buildPipelineMessage = String(msg.prefix(120))
                    }
                }
            )

            // Auto-set usesNonExemptEncryption = false on the processed build
            if let service, let appId {
                if let latestBuild = try? await service.fetchLatestBuild(appId: appId) {
                    try? await service.patchBuildEncryption(
                        buildId: latestBuild.id,
                        usesNonExemptEncryption: false
                    )
                }
            }

            await MainActor.run {
                appState.ascManager.buildPipelinePhase = .idle
                appState.ascManager.buildPipelineMessage = ""
            }

            var response: [String: Any] = [
                "success": true,
                "processingState": result.processingState ?? "UNKNOWN",
                "log": result.log
            ]
            if let version = result.buildVersion {
                response["buildVersion"] = version
            }
            return mcpJSON(response)
        } catch {
            await MainActor.run {
                appState.ascManager.buildPipelinePhase = .idle
                appState.ascManager.buildPipelineMessage = ""
            }
            return mcpText("Error uploading to TestFlight: \(error.localizedDescription)")
        }
    }

    // MARK: - Helpers

    private func mcpText(_ text: String) -> [String: Any] {
        ["content": [["type": "text", "text": text]]]
    }

    private func mcpJSON(_ value: Any) -> [String: Any] {
        if let data = try? JSONSerialization.data(withJSONObject: value),
           let str = String(data: data, encoding: .utf8) {
            return mcpText(str)
        }
        return mcpText("{}")
    }

    private func humanDescription(tool: String, args: [String: Any]) -> String {
        switch tool {
        case "project_create":
            let name = args["name"] as? String ?? "unknown"
            let type = args["type"] as? String ?? "blitz"
            return "Create a new project named '\(name)' (type: \(type))"
        case "project_open":
            let id = args["projectId"] as? String ?? "unknown"
            return "Open project '\(id)'"
        case "project_import":
            let path = args["path"] as? String ?? "unknown"
            return "Import project from '\(path)'"
        case "project_close":
            return "Close the current project"
        case "simulator_select_device":
            let udid = args["udid"] as? String ?? "unknown"
            return "Boot simulator '\(udid)'"
        case "simulator_start_streaming":
            return "Start screen capture streaming"
        case "simulator_stop_streaming":
            return "Stop screen capture streaming"
        case "db_disconnect":
            return "Disconnect from the database"
        case "db_insert_record":
            return "Insert a new database record"
        case "db_update_record":
            let id = args["id"] as? String ?? "unknown"
            return "Update database record '\(id)'"
        case "db_delete_record":
            let id = args["id"] as? String ?? "unknown"
            return "Delete database record '\(id)'"
        case "settings_update":
            return "Update app settings"
        case "settings_save":
            return "Save settings to disk"
        case "recording_start":
            return "Start screen recording"
        case "recording_stop":
            return "Stop screen recording"
        case "asc_fill_form":
            let tab = args["tab"] as? String ?? "unknown"
            let count = (args["fields"] as? [[String: Any]])?.count ?? 0
            return "Fill \(count) field(s) in \(tab)"
        case "asc_upload_screenshots":
            let count = (args["screenshotPaths"] as? [String])?.count ?? 0
            return "Upload \(count) screenshot(s) to App Store Connect"
        case "asc_open_submit_preview":
            return "Check readiness and open Submit for Review"
        case "app_store_setup_signing":
            return "Set up iOS code signing (certificate, profile, bundle ID)"
        case "app_store_build":
            let scheme = args["scheme"] as? String ?? "auto-detect"
            return "Build IPA (scheme: \(scheme))"
        case "app_store_upload":
            return "Upload IPA to App Store Connect / TestFlight"
        default:
            return "Execute '\(tool)'"
        }
    }

    private func parseDeviceAction(_ type: String, params: [String: Any]) throws -> DeviceAction {
        switch type {
        case "tap":
            let x = params["x"] as? Double ?? 0
            let y = params["y"] as? Double ?? 0
            return .tap(x: x, y: y)
        case "swipe":
            return .swipe(
                fromX: params["fromX"] as? Double ?? 0,
                fromY: params["fromY"] as? Double ?? 0,
                toX: params["toX"] as? Double ?? 0,
                toY: params["toY"] as? Double ?? 0,
                duration: params["duration"] as? Double
            )
        case "button":
            let button = params["button"] as? String ?? "HOME"
            guard let buttonType = DeviceAction.ButtonType(rawValue: button) else {
                throw MCPServerService.MCPError.invalidToolArgs
            }
            return .button(buttonType)
        case "input-text":
            let text = params["text"] as? String ?? ""
            return .inputText(text)
        case "key":
            if let code = params["key"] as? Int {
                return .key(.keycode(code))
            } else if let char = params["key"] as? String {
                return .key(.character(char))
            }
            throw MCPServerService.MCPError.invalidToolArgs
        default:
            throw MCPServerService.MCPError.unknownTool(type)
        }
    }
}
