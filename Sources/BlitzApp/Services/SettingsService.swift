import Foundation

/// Reads/writes ~/.blitz/settings.json
@Observable
final class SettingsService {
    /// Shared singleton for permission checks from non-UI code (e.g. ApprovalRequest)
    static let shared = SettingsService()

    private let settingsURL: URL

    var simulatorFPS: Int = 30
    var showCursor: Bool = true
    var cursorSize: Double = 20
    var recordingFormat: String = "mov"
    var defaultSimulatorUDID: String?

    // Permission toggles: category rawValue → requires approval (default true)
    var permissionToggles: [String: Bool] = [:]

    // Auto-navigate to tab on MCP tool call
    var autoNavEnabled: Bool = true

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.settingsURL = home.appendingPathComponent(".blitz/settings.json")
    }

    func load() {
        guard let data = try? Data(contentsOf: settingsURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        if let fps = json["simulatorFPS"] as? Int { simulatorFPS = fps }
        if let cursor = json["showCursor"] as? Bool { showCursor = cursor }
        if let size = json["cursorSize"] as? Double { cursorSize = size }
        if let format = json["recordingFormat"] as? String { recordingFormat = format }
        if let udid = json["defaultSimulatorUDID"] as? String { defaultSimulatorUDID = udid }
        if let toggles = json["permissionToggles"] as? [String: Bool] { permissionToggles = toggles }
        if let autoNav = json["autoNavEnabled"] as? Bool { autoNavEnabled = autoNav }

    }

    func save() {
        var json: [String: Any] = [
            "simulatorFPS": simulatorFPS,
            "showCursor": showCursor,
            "cursorSize": cursorSize,
            "recordingFormat": recordingFormat,
            "autoNavEnabled": autoNavEnabled,
        ]
        if let udid = defaultSimulatorUDID {
            json["defaultSimulatorUDID"] = udid
        }
        if !permissionToggles.isEmpty {
            json["permissionToggles"] = permissionToggles
        }

        guard let data = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted) else { return }

        // Ensure directory exists
        let dir = settingsURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: settingsURL)
    }
}
