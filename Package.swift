// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "TreeSitterTelora",
    products: [
        .library(name: "TreeSitterTelora", targets: ["TreeSitterTelora"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ChimeHQ/SwiftTreeSitter", from: "0.8.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterTelora",
            dependencies: [],
            path: ".",
            sources: [
                "src/parser.c",
                // NOTE: if your language has an external scanner, add it here.
            ],
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift",
            cSettings: [.headerSearchPath("src")]
        ),
        .testTarget(
            name: "TreeSitterTeloraTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterTelora",
            ],
            path: "bindings/swift/TreeSitterTeloraTests"
        )
    ],
    cLanguageStandard: .c11
)
