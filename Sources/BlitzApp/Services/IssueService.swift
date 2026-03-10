import Foundation

/// CRUD for UI annotation issues
@Observable
final class IssueService {
    private let storageDir: URL

    var issues: [Issue] = []
    var openCount: Int { issues.filter { $0.status == .open }.count }

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.storageDir = home.appendingPathComponent(".blitz/issues")
        try? FileManager.default.createDirectory(at: storageDir, withIntermediateDirectories: true)
    }

    func add(_ issue: Issue) {
        issues.append(issue)
        save(issue)
    }

    func update(_ issue: Issue) {
        if let index = issues.firstIndex(where: { $0.id == issue.id }) {
            issues[index] = issue
            save(issue)
        }
    }

    func delete(id: String) {
        issues.removeAll { $0.id == id }
        let url = storageDir.appendingPathComponent("\(id).json")
        try? FileManager.default.removeItem(at: url)
    }

    func loadIssues() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: storageDir, includingPropertiesForKeys: nil) else { return }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        issues = files.compactMap { url in
            guard url.pathExtension == "json",
                  let data = try? Data(contentsOf: url),
                  let issue = try? decoder.decode(Issue.self, from: data) else { return nil }
            return issue
        }.sorted { $0.createdAt > $1.createdAt }
    }

    private func save(_ issue: Issue) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = .prettyPrinted
        guard let data = try? encoder.encode(issue) else { return }
        let url = storageDir.appendingPathComponent("\(issue.id).json")
        try? data.write(to: url)
    }
}
