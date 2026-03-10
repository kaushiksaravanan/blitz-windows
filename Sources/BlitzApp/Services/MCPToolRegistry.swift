import Foundation

/// Static definitions for all MCP tools exposed by Blitz
enum MCPToolRegistry {

    /// Returns all tool definitions for the MCP tools/list response
    static func allTools() -> [[String: Any]] {
        var tools: [[String: Any]] = []

        // -- App State --
        tools.append(tool(
            name: "app_get_state",
            description: "Get current project, active tab, and streaming status",
            properties: [:],
            required: []
        ))

        // -- Navigation --
        tools.append(tool(
            name: "nav_switch_tab",
            description: "Switch the active sidebar tab",
            properties: [
                "tab": ["type": "string", "description": "Tab name", "enum": [
                    "simulator", "database", "tests", "assets",
                    "ascOverview", "storeListing", "screenshots", "appDetails", "pricing", "review",
                    "analytics", "reviews",
                    "builds", "groups", "betaInfo", "feedback",
                    "settings"
                ]]
            ],
            required: ["tab"]
        ))

        tools.append(tool(
            name: "nav_list_tabs",
            description: "List all available tabs with their groups",
            properties: [:],
            required: []
        ))

        // -- Projects --
        tools.append(tool(
            name: "project_list",
            description: "List all projects",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "project_get_active",
            description: "Get active project details",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "project_open",
            description: "Open a project by its ID",
            properties: [
                "projectId": ["type": "string", "description": "Project ID to open"]
            ],
            required: ["projectId"]
        ))

        tools.append(tool(
            name: "project_create",
            description: "Create a new Blitz project",
            properties: [
                "name": ["type": "string", "description": "Project name"],
                "type": ["type": "string", "description": "Project type (blitz, react-native, flutter, swift)", "enum": ["blitz", "react-native", "flutter", "swift"]]
            ],
            required: ["name", "type"]
        ))

        tools.append(tool(
            name: "project_import",
            description: "Import an existing project from a path",
            properties: [
                "path": ["type": "string", "description": "Absolute path to project"],
                "type": ["type": "string", "description": "Project type", "enum": ["blitz", "react-native", "flutter", "swift"]]
            ],
            required: ["path", "type"]
        ))

        tools.append(tool(
            name: "project_close",
            description: "Close the current project",
            properties: [:],
            required: []
        ))

        // -- Simulator --
        tools.append(tool(
            name: "simulator_list_devices",
            description: "List all simulators and physical devices",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "simulator_select_device",
            description: "Select and boot a simulator by UDID",
            properties: [
                "udid": ["type": "string", "description": "Device UDID"]
            ],
            required: ["udid"]
        ))

        tools.append(tool(
            name: "simulator_start_streaming",
            description: "Start screen capture streaming from the simulator",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "simulator_stop_streaming",
            description: "Stop screen capture streaming",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "simulator_press_home",
            description: "Press the home button on the simulator",
            properties: [
                "udid": ["type": "string", "description": "Device UDID (optional)"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "simulator_send_text",
            description: "Send keyboard text to the simulator",
            properties: [
                "text": ["type": "string", "description": "Text to type"],
                "udid": ["type": "string", "description": "Device UDID (optional)"]
            ],
            required: ["text"]
        ))

        tools.append(tool(
            name: "simulator_toggle_keyboard",
            description: "Toggle the keyboard input bar visibility",
            properties: [:],
            required: []
        ))

        // -- Database --
        tools.append(tool(
            name: "db_connect",
            description: "Connect to the active project's Teenybase database",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "db_disconnect",
            description: "Disconnect from the database",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "db_list_tables",
            description: "List all database tables",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "db_select_table",
            description: "Select the active table for queries",
            properties: [
                "table": ["type": "string", "description": "Table name"]
            ],
            required: ["table"]
        ))

        tools.append(tool(
            name: "db_query_rows",
            description: "Query rows with pagination, sorting, and search",
            properties: [
                "table": ["type": "string", "description": "Table name (optional, uses selected)"],
                "limit": ["type": "integer", "description": "Max rows to return"],
                "offset": ["type": "integer", "description": "Row offset for pagination"],
                "orderBy": ["type": "string", "description": "Field to sort by"],
                "ascending": ["type": "boolean", "description": "Sort ascending"],
                "search": ["type": "string", "description": "Search text"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "db_insert_record",
            description: "Insert a new record into a table",
            properties: [
                "table": ["type": "string", "description": "Table name (optional, uses selected)"],
                "values": ["type": "object", "description": "Field-value pairs to insert"]
            ],
            required: ["values"]
        ))

        tools.append(tool(
            name: "db_update_record",
            description: "Update an existing record",
            properties: [
                "table": ["type": "string", "description": "Table name (optional, uses selected)"],
                "id": ["type": "string", "description": "Record ID"],
                "values": ["type": "object", "description": "Field-value pairs to update"]
            ],
            required: ["id", "values"]
        ))

        tools.append(tool(
            name: "db_delete_record",
            description: "Delete a record from a table",
            properties: [
                "table": ["type": "string", "description": "Table name (optional, uses selected)"],
                "id": ["type": "string", "description": "Record ID"]
            ],
            required: ["id"]
        ))

        // -- Settings --
        tools.append(tool(
            name: "settings_get",
            description: "Get current app settings",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "settings_update",
            description: "Update app settings (FPS, cursor, recording format)",
            properties: [
                "simulatorFPS": ["type": "integer", "description": "Frame rate (30 or 60)"],
                "showCursor": ["type": "boolean", "description": "Show cursor overlay"],
                "cursorSize": ["type": "number", "description": "Cursor size in pixels"],
                "recordingFormat": ["type": "string", "description": "Recording format", "enum": ["mov", "mp4"]]
            ],
            required: []
        ))

        tools.append(tool(
            name: "settings_save",
            description: "Save current settings to disk",
            properties: [:],
            required: []
        ))

        // -- Recording --
        tools.append(tool(
            name: "recording_start",
            description: "Start screen recording",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "recording_stop",
            description: "Stop screen recording",
            properties: [:],
            required: []
        ))

        // -- Device interaction (existing tools) --
        tools.append(tool(
            name: "describe_screen",
            description: "Get the full UI element hierarchy of the current screen",
            properties: [
                "udid": ["type": "string", "description": "Device UDID"],
                "nested": ["type": "boolean", "description": "Include nested hierarchy"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "device_action",
            description: "Execute a single device action (tap, swipe, button, input-text, key)",
            properties: [
                "action": ["type": "string", "enum": ["tap", "swipe", "button", "input-text", "key"]],
                "params": ["type": "object"],
                "udid": ["type": "string"]
            ],
            required: ["action", "params"]
        ))

        tools.append(tool(
            name: "device_actions",
            description: "Execute multiple device actions in sequence",
            properties: [
                "actions": [
                    "type": "array",
                    "items": [
                        "type": "object",
                        "properties": [
                            "action": ["type": "string"],
                            "params": ["type": "object"]
                        ]
                    ]
                ],
                "udid": ["type": "string"]
            ],
            required: ["actions"]
        ))

        tools.append(tool(
            name: "get_simulator_screenshot",
            description: "Capture a screenshot of the iOS simulator",
            properties: [
                "udid": ["type": "string", "description": "Simulator UDID (optional, uses booted)"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "get_device_screenshot",
            description: "Capture a screenshot of a physical iPhone via WebDriverAgent",
            properties: [
                "port": ["type": "integer", "description": "WDA port (default 8100)"],
                "sessionId": ["type": "string", "description": "Existing WDA session ID (optional, creates new session if omitted)"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "get_blitz_screenshot",
            description: "Capture a screenshot of the Blitz macOS app main window",
            properties: [:],
            required: []
        ))

        tools.append(tool(
            name: "scan_ui",
            description: "Find interactive UI elements on the current screen",
            properties: [
                "query": ["type": "string", "description": "Search for elements matching text"],
                "region": ["type": "string", "enum": ["full", "top-half", "bottom-half"]],
                "udid": ["type": "string"]
            ],
            required: ["region"]
        ))

        // -- Tab State --
        tools.append(tool(
            name: "get_tab_state",
            description: "Get the structured data state of any Blitz tab. Returns form field values, submission readiness, versions, builds, localizations, etc. Use this instead of screenshots to read UI state.",
            properties: [
                "tab": ["type": "string", "description": "Tab to read state from (defaults to currently active tab)", "enum": [
                    "ascOverview", "storeListing", "screenshots", "appDetails", "pricing", "review",
                    "analytics", "reviews", "builds", "groups", "betaInfo", "feedback"
                ]]
            ],
            required: []
        ))

        // -- ASC Form Tools --
        tools.append(tool(
            name: "asc_fill_form",
            description: "Fill one or more App Store Connect form fields. Navigates to the tab automatically if auto-nav is enabled. See CLAUDE.md for complete field reference.",
            properties: [
                "tab": ["type": "string", "description": "Target form tab", "enum": [
                    "storeListing", "appDetails", "pricing", "review.ageRating", "review.contact", "settings.bundleId"
                ]],
                "fields": [
                    "type": "array",
                    "items": [
                        "type": "object",
                        "properties": [
                            "field": ["type": "string"],
                            "value": ["type": "string"]
                        ],
                        "required": ["field", "value"]
                    ] as [String: Any]
                ] as [String: Any]
            ],
            required: ["tab", "fields"]
        ))

        tools.append(tool(
            name: "asc_upload_screenshots",
            description: "Upload screenshot files to App Store Connect for the active version.",
            properties: [
                "screenshotPaths": [
                    "type": "array",
                    "items": ["type": "string"]
                ] as [String: Any],
                "displayType": ["type": "string", "description": "Display type", "enum": ["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"]],
                "locale": ["type": "string", "description": "e.g. en-US"]
            ],
            required: ["screenshotPaths", "displayType"]
        ))

        tools.append(tool(
            name: "asc_open_submit_preview",
            description: "Check submission readiness and open the Submit for Review modal. Returns list of missing required fields if incomplete.",
            properties: [:],
            required: []
        ))

        // -- Build Pipeline --
        tools.append(tool(
            name: "app_store_setup_signing",
            description: "Set up iOS code signing: registers bundle ID, creates distribution certificate, installs provisioning profile, and configures the Xcode project. Idempotent — re-running skips completed steps.",
            properties: [
                "teamId": ["type": "string", "description": "Apple Developer Team ID (optional if already saved in project metadata)"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "app_store_build",
            description: "Build an IPA for App Store submission. Archives the Xcode project and exports a signed IPA.",
            properties: [
                "scheme": ["type": "string", "description": "Xcode scheme (auto-detected if omitted)"],
                "configuration": ["type": "string", "description": "Build configuration (default: Release)"]
            ],
            required: []
        ))

        tools.append(tool(
            name: "app_store_upload",
            description: "Upload an IPA to App Store Connect / TestFlight. Optionally polls until build processing completes.",
            properties: [
                "ipaPath": ["type": "string", "description": "Path to IPA file (uses latest build output if omitted)"],
                "skipPolling": ["type": "boolean", "description": "Skip waiting for build processing (default: false)"]
            ],
            required: []
        ))

        return tools
    }

    /// Determine the category for a given tool name
    static func category(for toolName: String) -> ApprovalRequest.ToolCategory {
        switch toolName {
        // Navigation / read-only
        case "app_get_state", "nav_switch_tab", "nav_list_tabs":
            return .navigation
        case "project_list", "project_get_active":
            return .query
        case "simulator_list_devices", "simulator_press_home",
             "simulator_send_text", "simulator_toggle_keyboard":
            return .query
        case "db_list_tables", "db_select_table", "db_query_rows", "db_connect":
            return .query
        case "settings_get":
            return .query
        case "describe_screen", "device_action", "device_actions",
             "get_simulator_screenshot", "get_device_screenshot",
             "get_blitz_screenshot", "scan_ui",
             "get_tab_state":
            return .query

        // Mutations
        case "project_open", "project_create", "project_import", "project_close":
            return .projectMutation
        case "simulator_select_device", "simulator_start_streaming",
             "simulator_stop_streaming":
            return .simulatorControl
        case "db_disconnect", "db_insert_record", "db_update_record", "db_delete_record":
            return .databaseMutation
        case "settings_update", "settings_save":
            return .settingsMutation
        case "recording_start", "recording_stop":
            return .recording

        // ASC mutation tools
        case "asc_fill_form":
            return .ascFormMutation
        case "asc_upload_screenshots":
            return .ascScreenshotMutation
        case "asc_open_submit_preview":
            return .ascSubmitMutation

        // Build pipeline tools
        case "app_store_setup_signing", "app_store_build", "app_store_upload":
            return .buildPipeline

        default:
            return .query
        }
    }

    // MARK: - Helper

    private static func tool(
        name: String,
        description: String,
        properties: [String: Any],
        required: [String]
    ) -> [String: Any] {
        var schema: [String: Any] = [
            "type": "object",
            "properties": properties
        ]
        if !required.isEmpty {
            schema["required"] = required
        }
        return [
            "name": name,
            "description": description,
            "inputSchema": schema
        ]
    }
}
