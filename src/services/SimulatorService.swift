import AppKit
import Foundation
import os

private let logger = Logger(subsystem: "com.blitz.macos", category: "SimulatorService")

/// High-level simulator management service
actor SimulatorService {
    private let simctl = SimctlClient()

    /// List all available simulators
    func listDevices() async throws -> [SimctlClient.SimctlDevice] {
        try await simctl.listDevices()
    }

    /// Boot a simulator, then opens Simulator.app to show its window
    func boot(udid: String) async throws {
        logger.info("Booting simulator \(udid)...")

        // Boot the specific device FIRST — before opening Simulator.app,
        // otherwise Simulator.app auto-boots its last-used device.
        do {
            try await simctl.boot(udid: udid)
        } catch {
            // "Unable to boot device in current state: Booted" is not a real error
            if let processError = error as? ProcessRunner.ProcessError,
               processError.stderr.contains("current state: Booted") {
                logger.info("Simulator already booted")
            } else {
                throw error
            }
        }

        // Wait for boot to complete — poll until state is Booted
        logger.info("Waiting for simulator to finish booting...")
        for i in 1...15 {
            let devices = try await simctl.listDevices()
            if let device = devices.first(where: { $0.udid == udid }), device.isBooted {
                logger.info("Simulator booted after \(i)s")
                break
            }
            try await Task.sleep(for: .seconds(1))
        }

        // Open Simulator.app AFTER boot so it shows the correct device window
        // (opening before boot causes it to auto-boot its last-used device)
        try await openSimulatorApp()
    }

    /// Boot a simulator without bringing Simulator.app to the foreground.
    func bootInBackground(udid: String) async throws {
        logger.info("Booting simulator \(udid) in background...")

        do {
            try await simctl.boot(udid: udid)
        } catch {
            if let processError = error as? ProcessRunner.ProcessError,
               processError.stderr.contains("current state: Booted") {
                logger.info("Simulator already booted")
            } else {
                throw error
            }
        }

        // Wait for boot
        for i in 1...15 {
            let devices = try await simctl.listDevices()
            if let device = devices.first(where: { $0.udid == udid }), device.isBooted {
                logger.info("Simulator booted after \(i)s")
                break
            }
            try await Task.sleep(for: .seconds(1))
        }

        // Open Simulator.app behind Blitz — ScreenCaptureKit needs the window to exist
        // but it captures occluded windows fine, so it doesn't need to be in front.
        try await openSimulatorAppBehind()
    }

    /// Shutdown a simulator
    func shutdown(udid: String) async throws {
        try await simctl.shutdown(udid: udid)
    }

    /// Install an app bundle
    func installApp(udid: String, appPath: String) async throws {
        try await simctl.install(udid: udid, appPath: appPath)
    }

    /// Launch an app by bundle ID
    func launchApp(udid: String, bundleId: String) async throws {
        try await simctl.launch(udid: udid, bundleId: bundleId)
    }

    /// Take a screenshot and save to path
    func screenshot(udid: String, saveTo path: String) async throws {
        try await simctl.screenshot(udid: udid, path: path)
    }

    /// Open the Simulator.app (brings to foreground — used for initial boot)
    func openSimulatorApp() async throws {
        _ = try await ProcessRunner.run("open", arguments: ["-a", "Simulator"])
        try await Task.sleep(for: .milliseconds(500))
    }

    /// Open Simulator.app behind Blitz's window.
    ///
    /// Strategy:
    /// 1. Float Blitz's window so it stays on top during launch
    /// 2. Launch Simulator.app without activation (NSWorkspace API)
    /// 3. Move Simulator's window directly behind Blitz's window (same position)
    /// 4. Restore Blitz to normal window level
    ///
    /// ScreenCaptureKit captures occluded windows fine, so Simulator
    /// just needs to exist — it doesn't need to be visible.
    func openSimulatorAppBehind() async throws {
        // 1. Capture Blitz's window frame and float it
        let blitzFrame = await MainActor.run {
            let frame = NSApp.mainWindow?.frame
            NSApp.mainWindow?.level = .floating
            return frame
        }

        // 2. Launch Simulator without activation
        if let simURL = NSWorkspace.shared.urlForApplication(
            withBundleIdentifier: "com.apple.iphonesimulator"
        ) {
            let config = NSWorkspace.OpenConfiguration()
            config.activates = false
            try await NSWorkspace.shared.openApplication(at: simURL, configuration: config)
        } else {
            _ = try? await ProcessRunner.run("open", arguments: ["-gja", "Simulator"])
        }

        // 3. Wait for Simulator window to appear, then move it behind Blitz
        try await Task.sleep(for: .milliseconds(800))
        if let frame = blitzFrame {
            await Self.moveSimulatorWindowBehind(blitzFrame: frame)
        }

        // 4. Restore normal level and re-activate Blitz
        await MainActor.run {
            NSApp.mainWindow?.level = .normal
            NSApp.activate()
        }
    }

    /// Move Simulator.app's window to the same position as Blitz's window
    /// using the Accessibility API, so it's completely hidden behind Blitz.
    @MainActor
    private static func moveSimulatorWindowBehind(blitzFrame: NSRect) {
        // Find Simulator's pid
        guard let simApp = NSRunningApplication.runningApplications(
            withBundleIdentifier: "com.apple.iphonesimulator"
        ).first else { return }

        let appRef = AXUIElementCreateApplication(simApp.processIdentifier)

        // Get the window list
        var windowsRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute as CFString, &windowsRef) == .success,
              let windows = windowsRef as? [AXUIElement],
              let simWindow = windows.first else { return }

        // Move to Blitz's origin (Accessibility uses top-left origin, NSRect uses bottom-left)
        let screenHeight = NSScreen.main?.frame.height ?? 0
        let topLeftX = blitzFrame.origin.x
        let topLeftY = screenHeight - blitzFrame.origin.y - blitzFrame.height
        var position = CGPoint(x: topLeftX, y: topLeftY)
        if let posValue = AXValueCreate(.cgPoint, &position) {
            AXUIElementSetAttributeValue(simWindow, kAXPositionAttribute as CFString, posValue)
        }

        // Resize to match Blitz
        var size = CGSize(width: blitzFrame.width, height: blitzFrame.height)
        if let sizeValue = AXValueCreate(.cgSize, &size) {
            AXUIElementSetAttributeValue(simWindow, kAXSizeAttribute as CFString, sizeValue)
        }
    }
}
