import Foundation
import TakesCore
import Testing

@Test func `the fixtures ship with the test bundle`() throws {
  let outline = try #require(
    Bundle.module.url(forResource: "outline", withExtension: "md", subdirectory: "Fixtures"))
  #expect(try String(contentsOf: outline, encoding: .utf8).contains("**1. Hook.**"))
  #expect(Takes.projectVersion == 1)
}
