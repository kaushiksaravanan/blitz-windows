import Foundation

/// Protocol types for communication with the Node.js sidecar over Unix domain socket

// MARK: - Requests

public struct CreateProjectRequest: Codable, Sendable {
    public let name: String
    public let type: ProjectType
    public let template: String?

    public init(name: String, type: ProjectType, template: String? = nil) {
        self.name = name
        self.type = type
        self.template = template
    }
}

public struct ImportProjectRequest: Codable, Sendable {
    public let path: String
    public let type: ProjectType

    public init(path: String, type: ProjectType) {
        self.path = path
        self.type = type
    }
}

public struct StartRuntimeRequest: Codable, Sendable {
    public let projectId: String
    public let simulatorUDID: String?

    public init(projectId: String, simulatorUDID: String? = nil) {
        self.projectId = projectId
        self.simulatorUDID = simulatorUDID
    }
}

// MARK: - Responses

public struct CreateProjectResponse: Codable, Sendable {
    public let projectId: String
    public let path: String
}

public struct RuntimeStatusResponse: Codable, Sendable {
    public let status: String
    public let error: String?
    public let metroPort: Int?
    public let vitePort: Int?
    public let backendPort: Int?
}

public struct BackendLogsResponse: Codable, Sendable {
    public let logs: [String]
}

// MARK: - Sidecar Routes

public enum SidecarRoute {
    case createProject
    case importProject
    case startRuntime(projectId: String)
    case runtimeStatus(projectId: String)
    case stopRuntime(projectId: String)
    case reloadMetro
    case backendLogs(projectId: String)

    public var method: String {
        switch self {
        case .createProject, .importProject, .startRuntime, .stopRuntime, .reloadMetro:
            return "POST"
        case .runtimeStatus, .backendLogs:
            return "GET"
        }
    }

    public var path: String {
        switch self {
        case .createProject:
            return "/projects"
        case .importProject:
            return "/projects/import"
        case .startRuntime(let id):
            return "/projects/\(id)/runtime"
        case .runtimeStatus(let id):
            return "/projects/\(id)/runtime-status"
        case .stopRuntime(let id):
            return "/projects/\(id)/runtime/stop"
        case .reloadMetro:
            return "/simulator/reload"
        case .backendLogs(let id):
            return "/projects/\(id)/backend-logs"
        }
    }
}
