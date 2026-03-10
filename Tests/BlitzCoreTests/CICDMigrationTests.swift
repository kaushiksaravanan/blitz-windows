import Testing
import Foundation
@testable import BlitzCore

// ── CI/CD Migration: Swift-level tests ───────────────────────────────────────
//
// NodeSidecarService lives in BlitzApp (executable target), which cannot be
// imported with @testable. Instead, we verify observable contracts through:
//   1. Source file inspection (path order, HomeDirectory API usage)
//   2. BlitzCore protocol/type correctness
//
// The full script-level tests live in tests/cicd-tests.sh.

@Suite("CI/CD Migration — source contract tests")
struct CICDMigrationTests {

    // ── NodeSidecarService source verification ────────────────────────────────

    /// Reads NodeSidecarService.swift and verifies it contains the
    /// ~/.blitz/node-runtime path added as part of the cicd-migration plan.
    @Test("NodeSidecarService includes ~/.blitz/node-runtime in node candidates")
    func nodeSidecarIncludesBlitzNodeRuntime() throws {
        let source = try sidecarServiceSource()
        #expect(source.contains("node-runtime/bin/node"),
            "Expected node-runtime/bin/node in node search candidates")
    }

    /// Verifies the node-runtime path is checked *before* system paths so
    /// Blitz-managed Node takes priority over whatever the user has installed.
    @Test("~/.blitz/node-runtime is checked before /usr/local/bin/node")
    func nodeRuntimePathHasPriority() throws {
        let source = try sidecarServiceSource()
        let nodeRuntimeRange = try #require(source.range(of: "node-runtime/bin/node"))
        let usrLocalRange    = try #require(source.range(of: "/usr/local/bin/node"))
        #expect(nodeRuntimeRange.lowerBound < usrLocalRange.lowerBound,
            "node-runtime should appear before /usr/local/bin/node in the candidates list")
    }

    /// Confirms the implementation uses FileManager.homeDirectoryForCurrentUser
    /// rather than a hardcoded "~" (which doesn't expand in Swift string literals).
    @Test("NodeSidecarService uses homeDirectoryForCurrentUser, not hardcoded ~")
    func nodeRuntimeUsesHomeDirectoryAPI() throws {
        let source = try sidecarServiceSource()
        #expect(source.contains("homeDirectoryForCurrentUser"),
            "Should use FileManager.default.homeDirectoryForCurrentUser to resolve home path")
        // Make sure we didn't accidentally write a literal tilde path
        #expect(!source.contains("\"~/"),
            "Should not use literal '~/' in Swift string — it won't expand")
    }

    // ── BlitzCore: SidecarProtocol ────────────────────────────────────────────
    // The sidecar HTTP routes that NodeSidecarService calls must remain stable
    // across the migration. Verify the protocol paths defined in BlitzCore.

    @Test("SidecarRoute.createProject path is /projects")
    func sidecarCreateProjectPath() {
        #expect(SidecarRoute.createProject.path == "/projects")
    }

    @Test("SidecarRoute.importProject path is /projects/import")
    func sidecarImportProjectPath() {
        #expect(SidecarRoute.importProject.path == "/projects/import")
    }

    @Test("SidecarRoute.startRuntime path is /projects/{id}/runtime")
    func sidecarStartRuntimePath() {
        #expect(SidecarRoute.startRuntime(projectId: "abc").path == "/projects/abc/runtime")
    }

    @Test("SidecarRoute.reloadMetro path is /simulator/reload")
    func sidecarReloadMetroPath() {
        #expect(SidecarRoute.reloadMetro.path == "/simulator/reload")
    }

    @Test("SidecarRoute POST methods are correct")
    func sidecarPostMethods() {
        #expect(SidecarRoute.createProject.method == "POST")
        #expect(SidecarRoute.importProject.method  == "POST")
        #expect(SidecarRoute.reloadMetro.method    == "POST")
    }

    @Test("SidecarRoute GET methods are correct")
    func sidecarGetMethods() {
        #expect(SidecarRoute.runtimeStatus(projectId: "x").method == "GET")
    }

    // ── Package.swift contract ────────────────────────────────────────────────
    // Ensure the test target can still import BlitzCore (i.e. the library
    // target wasn't accidentally broken by our changes to BlitzApp).

    @Test("BlitzCore library is importable (executable target not accidentally merged)")
    func blitzCoreIsImportable() {
        // If @testable import BlitzCore above compiled, this trivially passes.
        // The real value is as a compile-time guard.
        #expect(Bool(true))
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

private func sidecarServiceSource() throws -> String {
    // Walk from the test bundle up to the package root, then find the source file.
    // Works whether run via `swift test` or Xcode.
    var url = URL(fileURLWithPath: #filePath)   // .../Tests/BlitzCoreTests/CICDMigrationTests.swift
    // Go up: BlitzCoreTests → Tests → package root
    url = url.deletingLastPathComponent()       // BlitzCoreTests/
    url = url.deletingLastPathComponent()       // Tests/
    url = url.deletingLastPathComponent()       // package root
    url = url.appendingPathComponent("Sources/BlitzApp/Services/NodeSidecarService.swift")

    guard FileManager.default.fileExists(atPath: url.path) else {
        throw SourceNotFound(path: url.path)
    }
    return try String(contentsOf: url, encoding: .utf8)
}

struct SourceNotFound: Error, CustomStringConvertible {
    let path: String
    var description: String { "Source file not found: \(path)" }
}
