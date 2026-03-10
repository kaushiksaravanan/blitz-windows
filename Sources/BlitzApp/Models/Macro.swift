import Foundation

struct Macro: Identifiable, Codable {
    let id: String
    var name: String
    var actions: [MacroAction]
    var createdAt: Date

    init(name: String, actions: [MacroAction] = []) {
        self.id = UUID().uuidString
        self.name = name
        self.actions = actions
        self.createdAt = Date()
    }
}

struct MacroAction: Codable {
    let type: ActionType
    let params: ActionParams
    let delayMs: Int // delay before this action

    enum ActionType: String, Codable {
        case tap
        case swipe
        case button
        case inputText = "input-text"
        case key
    }

    struct ActionParams: Codable {
        var x: Double?
        var y: Double?
        var fromX: Double?
        var fromY: Double?
        var toX: Double?
        var toY: Double?
        var duration: Double?
        var button: String?
        var text: String?
        var key: String?
    }
}
