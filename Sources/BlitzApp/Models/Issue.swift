import Foundation

struct Issue: Identifiable, Codable {
    let id: String
    var title: String
    var description: String
    var x: Double?
    var y: Double?
    var screenshotPath: String?
    var status: Status
    var createdAt: Date

    enum Status: String, Codable {
        case open
        case inProgress = "in_progress"
        case resolved
    }

    init(title: String, description: String = "", x: Double? = nil, y: Double? = nil) {
        self.id = UUID().uuidString
        self.title = title
        self.description = description
        self.x = x
        self.y = y
        self.status = .open
        self.createdAt = Date()
    }
}
