import XCTest
import SwiftTreeSitter
import TreeSitterTelora

final class TreeSitterTeloraTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_telora())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Telora grammar")
    }
}
