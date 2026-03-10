// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "Blitz",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Blitz", targets: ["BlitzApp"]),
        .library(name: "BlitzCore", targets: ["BlitzCore"]),
    ],
    targets: [
        .executableTarget(
            name: "BlitzApp",
            dependencies: ["BlitzCore"],
            path: "Sources/BlitzApp",
            exclude: ["Metal"],
            resources: [.process("Resources"), .copy("Templates")],
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("Metal"),
                .linkedFramework("MetalKit"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("CoreMediaIO"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("AppKit"),
            ]
        ),
        .target(
            name: "BlitzCore",
            path: "Sources/BlitzCore"
        ),
        .testTarget(
            name: "BlitzCoreTests",
            dependencies: ["BlitzCore"],
            path: "Tests/BlitzCoreTests"
        ),
    ]
)
