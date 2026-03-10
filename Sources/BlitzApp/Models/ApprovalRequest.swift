import Foundation

struct ApprovalRequest: Identifiable {
    let id: String
    let toolName: String
    let description: String
    let parameters: [String: String]
    let category: ToolCategory

    enum ToolCategory: String {
        case navigation, query
        case projectMutation
        case databaseMutation
        case settingsMutation
        case simulatorControl
        case recording
        case ascFormMutation
        case ascScreenshotMutation
        case ascSubmitMutation
        case buildPipeline
    }

    var requiresApproval: Bool {
        switch category {
        case .navigation, .query: return false
        default:
            // Check per-category permission toggles
            return SettingsService.shared.permissionToggles[category.rawValue] ?? true
        }
    }
}
