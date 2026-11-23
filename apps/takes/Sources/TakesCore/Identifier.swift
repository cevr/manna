import Foundation

/// A typed identifier: a string in the project file, a distinct type per kind of thing it names.
public struct Identifier<Tag>: Hashable, Sendable, Codable, CodingKeyRepresentable,
  CustomStringConvertible
{
  public let rawValue: String

  public init(_ rawValue: String) {
    self.rawValue = rawValue
  }

  /// A fresh random identifier.
  public static func make() -> Self {
    Self(UUID().uuidString.lowercased())
  }

  public var description: String { rawValue }

  public init(from decoder: any Decoder) throws {
    rawValue = try decoder.singleValueContainer().decode(String.self)
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  public var codingKey: any CodingKey { Key(stringValue: rawValue) }

  public init?<T: CodingKey>(codingKey: T) {
    self.init(codingKey.stringValue)
  }

  private struct Key: CodingKey {
    let stringValue: String
    var intValue: Int? { Int?.none }

    init(stringValue: String) {
      self.stringValue = stringValue
    }

    init?(intValue: Int) {
      self.stringValue = String(intValue)
    }
  }
}

public enum SourceTag {}
public enum BeatTag {}
public enum TakeTag {}
public enum ClipTag {}

public typealias SourceID = Identifier<SourceTag>
public typealias BeatID = Identifier<BeatTag>
public typealias TakeID = Identifier<TakeTag>
public typealias ClipID = Identifier<ClipTag>
