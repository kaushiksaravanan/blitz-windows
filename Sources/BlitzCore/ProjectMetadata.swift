import Foundation

/// Represents the `.blitz/project.json` metadata file
public struct BlitzProjectMetadata: Codable, Sendable {
    public var name: String
    public var type: ProjectType
    public var bundleIdentifier: String?
    public var createdAt: Date?
    public var lastOpenedAt: Date?
    public var simulatorUDID: String?
    public var buildSettings: BuildSettings?
    public var teamId: String?

    public init(
        name: String,
        type: ProjectType,
        bundleIdentifier: String? = nil,
        createdAt: Date? = nil,
        lastOpenedAt: Date? = nil,
        simulatorUDID: String? = nil,
        buildSettings: BuildSettings? = nil,
        teamId: String? = nil
    ) {
        self.name = name
        self.type = type
        self.bundleIdentifier = bundleIdentifier
        self.createdAt = createdAt
        self.lastOpenedAt = lastOpenedAt
        self.simulatorUDID = simulatorUDID
        self.buildSettings = buildSettings
        self.teamId = teamId
    }
}

public enum ProjectType: String, Codable, Sendable, CaseIterable {
    case blitz
    case reactNative = "react-native"
    case swift
    case flutter
}

public struct BuildSettings: Codable, Sendable {
    public var scheme: String?
    public var configuration: String?
    public var destination: String?

    public init(scheme: String? = nil, configuration: String? = nil, destination: String? = nil) {
        self.scheme = scheme
        self.configuration = configuration
        self.destination = destination
    }
}
