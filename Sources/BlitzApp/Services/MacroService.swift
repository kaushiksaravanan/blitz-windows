import Foundation

/// Record and replay device action macros
@Observable
final class MacroService {
    private let storageDir: URL
    private var recordStartTime: Date?
    private var lastActionTime: Date?
    private let deviceInteraction: DeviceInteractionService

    var macros: [Macro] = []
    var isRecording = false
    var isPlaying = false
    var currentRecordingActions: [MacroAction] = []

    init(deviceInteraction: DeviceInteractionService) {
        self.deviceInteraction = deviceInteraction
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.storageDir = home.appendingPathComponent(".blitz/macros")
        try? FileManager.default.createDirectory(at: storageDir, withIntermediateDirectories: true)
    }

    /// Start recording a macro
    func startRecording() {
        isRecording = true
        currentRecordingActions = []
        recordStartTime = Date()
        lastActionTime = Date()
    }

    /// Record an action during macro recording
    func recordAction(type: MacroAction.ActionType, params: MacroAction.ActionParams) {
        guard isRecording else { return }

        let now = Date()
        let delay = Int((now.timeIntervalSince(lastActionTime ?? now)) * 1000)
        lastActionTime = now

        let action = MacroAction(type: type, params: params, delayMs: max(delay, 0))
        currentRecordingActions.append(action)
    }

    /// Stop recording and save the macro
    func stopRecording(name: String) {
        guard isRecording else { return }
        isRecording = false

        let macro = Macro(name: name, actions: currentRecordingActions)
        macros.append(macro)
        saveMacro(macro)
        currentRecordingActions = []
    }

    /// Play a macro
    func play(macro: Macro, udid: String) async {
        guard !isPlaying else { return }
        isPlaying = true
        defer { isPlaying = false }

        for action in macro.actions {
            if Task.isCancelled { break }

            // Wait for delay
            if action.delayMs > 0 {
                try? await Task.sleep(for: .milliseconds(action.delayMs))
            }

            // Execute action
            let deviceAction = macroActionToDeviceAction(action)
            if let deviceAction {
                try? await deviceInteraction.execute(deviceAction, udid: udid)
            }
        }
    }

    /// Convert MacroAction to DeviceAction
    private func macroActionToDeviceAction(_ action: MacroAction) -> DeviceAction? {
        switch action.type {
        case .tap:
            guard let x = action.params.x, let y = action.params.y else { return nil }
            return .tap(x: x, y: y)
        case .swipe:
            guard let fx = action.params.fromX, let fy = action.params.fromY,
                  let tx = action.params.toX, let ty = action.params.toY else { return nil }
            return .swipe(fromX: fx, fromY: fy, toX: tx, toY: ty, duration: action.params.duration)
        case .button:
            guard let button = action.params.button,
                  let buttonType = DeviceAction.ButtonType(rawValue: button) else { return nil }
            return .button(buttonType)
        case .inputText:
            guard let text = action.params.text else { return nil }
            return .inputText(text)
        case .key:
            guard let key = action.params.key else { return nil }
            if let code = Int(key) {
                return .key(.keycode(code))
            }
            return .key(.character(key))
        }
    }

    // MARK: - Persistence

    func loadMacros() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: storageDir, includingPropertiesForKeys: nil) else { return }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        macros = files.compactMap { url in
            guard url.pathExtension == "json",
                  let data = try? Data(contentsOf: url),
                  let macro = try? decoder.decode(Macro.self, from: data) else { return nil }
            return macro
        }.sorted { $0.createdAt > $1.createdAt }
    }

    private func saveMacro(_ macro: Macro) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = .prettyPrinted

        guard let data = try? encoder.encode(macro) else { return }
        let url = storageDir.appendingPathComponent("\(macro.id).json")
        try? data.write(to: url)
    }

    func deleteMacro(id: String) {
        macros.removeAll { $0.id == id }
        let url = storageDir.appendingPathComponent("\(id).json")
        try? FileManager.default.removeItem(at: url)
    }
}
