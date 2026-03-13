import Foundation

/// Scaffolds a new React Native / Blitz project from the bundled template.
/// Handles the full lifecycle: copy template → patch placeholders → write .dev.vars
/// The AI agent handles npm install, pod install, metro, and builds.
struct ProjectSetupService {

    enum SetupStep: String {
        case copying = "Copying template..."
        case ready = "Ready"
    }

    struct SetupError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private static let sampleDevVars = """
    JWT_SECRET_MAIN=this_is_the_main_secret_used_for_all_tables_and_admin
    JWT_SECRET_USERS=secret_used_for_users_table_appended_to_the_main_secret
    ADMIN_SERVICE_TOKEN=password_for_accessing_the_backend_as_admin
    ADMIN_JWT_SECRET=this_will_be_used_for_jwt_token_for_admin_operations
    POCKET_UI_VIEWER_PASSWORD=admin_db_password_for_readonly_mode
    POCKET_UI_EDITOR_PASSWORD=admin_db_password_for_readwrite_mode
    MAILGUN_API_KEY=api-key-from-mailgun
    API_ROUTE=NA
    """

    private static let projectNamePlaceholder = "__PROJECT_NAME__"

    /// Set up a new project from the bundled RN template.
    /// Calls `onStep` on the main actor as each phase begins.
    static func setup(
        projectId: String,
        projectName: String,
        projectPath: String,
        onStep: @MainActor (SetupStep) -> Void
    ) async throws {

        let fm = FileManager.default

        // --- Step 1: Copy bundled template ---
        await onStep(.copying)
        print("[setup] Step 1: Copying bundled RN template")

        guard let templateURL = Bundle.appResources.url(forResource: "rn-notes-template", withExtension: nil, subdirectory: "templates") else {
            throw SetupError(message: "Bundled RN template not found")
        }
        print("[setup] Template source: \(templateURL.path)")
        print("[setup] Project path: \(projectPath)")

        // Back up project metadata before overwriting dir
        let metadataBackup = projectPath + "/.blitz/project.json"
        let metadataData = try? Data(contentsOf: URL(fileURLWithPath: metadataBackup))
        print("[setup] Metadata backed up: \(metadataData != nil)")

        // Remove existing (near-empty) project dir
        if fm.fileExists(atPath: projectPath) {
            try fm.removeItem(atPath: projectPath)
            print("[setup] Removed existing project dir")
        }

        // Recursively copy template, replacing placeholders in names & contents
        try copyTemplateDir(
            src: templateURL.path,
            dest: projectPath,
            projectName: projectName
        )
        print("[setup] Template copied and patched")

        // Remove any stale local database state from the template copy
        let localPersist = projectPath + "/.local-persist"
        if fm.fileExists(atPath: localPersist) {
            try? fm.removeItem(atPath: localPersist)
            print("[setup] Removed stale .local-persist")
        }

        // Restore project metadata
        let blitzDir = projectPath + "/.blitz"
        if !fm.fileExists(atPath: blitzDir) {
            try fm.createDirectory(atPath: blitzDir, withIntermediateDirectories: true)
        }
        if let data = metadataData {
            try data.write(to: URL(fileURLWithPath: metadataBackup))
            print("[setup] Metadata restored")
        }

        // Ensure .dev.vars exists
        let devVarsPath = projectPath + "/.dev.vars"
        if !fm.fileExists(atPath: devVarsPath) {
            let sampleVarsPath = projectPath + "/sample.vars"
            if fm.fileExists(atPath: sampleVarsPath) {
                try fm.copyItem(atPath: sampleVarsPath, toPath: devVarsPath)
                print("[setup] .dev.vars copied from sample.vars")
            } else {
                try sampleDevVars.write(toFile: devVarsPath, atomically: true, encoding: .utf8)
                print("[setup] .dev.vars written from default")
            }
        } else {
            print("[setup] .dev.vars already exists")
        }

        // --- Done ---
        await onStep(.ready)
        print("[setup] Project setup complete!")
    }

    // MARK: - Helpers

    /// Recursively copy a template directory, replacing placeholders in
    /// filenames/directory names and file contents.
    private static func copyTemplateDir(
        src: String,
        dest: String,
        projectName: String
    ) throws {
        let fm = FileManager.default
        try fm.createDirectory(atPath: dest, withIntermediateDirectories: true)

        let entries = try fm.contentsOfDirectory(atPath: src)
        for entry in entries {
            let srcPath = (src as NSString).appendingPathComponent(entry)
            let patchedName = entry.replacingOccurrences(of: projectNamePlaceholder, with: projectName)
            let destPath = (dest as NSString).appendingPathComponent(patchedName)

            var isDir: ObjCBool = false
            fm.fileExists(atPath: srcPath, isDirectory: &isDir)

            if isDir.boolValue {
                try copyTemplateDir(src: srcPath, dest: destPath, projectName: projectName)
            } else {
                var content = try String(contentsOfFile: srcPath, encoding: .utf8)
                content = content.replacingOccurrences(of: projectNamePlaceholder, with: projectName)
                try content.write(toFile: destPath, atomically: true, encoding: .utf8)
            }
        }
    }
}
