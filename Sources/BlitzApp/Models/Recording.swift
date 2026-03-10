import Foundation

struct RecordingMeta: Identifiable, Codable {
    let id: String
    let filePath: String
    let cursorDataPath: String?
    let startedAt: Date
    var duration: TimeInterval
    var width: Int
    var height: Int

    init(filePath: String, cursorDataPath: String? = nil, width: Int, height: Int) {
        self.id = UUID().uuidString
        self.filePath = filePath
        self.cursorDataPath = cursorDataPath
        self.startedAt = Date()
        self.duration = 0
        self.width = width
        self.height = height
    }
}
