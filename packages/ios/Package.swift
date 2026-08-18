// swift-tools-version:5.9
// Business Source License 1.1 (BSL-1.1)
// © 2026 Vectalon. Commercial use requires a paid license.

import PackageDescription

let package = Package(
    name: "VectalonIOS",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "VectalonIOS",
            targets: ["VectalonIOS"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "VectalonIOS",
            dependencies: [],
            path: "Sources/VectalonIOS"
        ),
        .testTarget(
            name: "VectalonIOSTests",
            dependencies: ["VectalonIOS"],
            path: "Tests/VectalonIOSTests"
        ),
    ]
)
