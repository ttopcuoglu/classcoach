import Foundation
import SwiftData

enum ScenarioCategory: String, Codable, CaseIterable, Identifiable {
    case defiance
    case disengagement
    case peerConflict
    case disruption
    case transitions
    case technology

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .defiance: return "Defiance"
        case .disengagement: return "Disengagement"
        case .peerConflict: return "Peer Conflict"
        case .disruption: return "Disruption"
        case .transitions: return "Transitions"
        case .technology: return "Technology Misuse"
        }
    }
}

enum GradeBand: String, Codable, CaseIterable, Identifiable {
    case middle = "6-8"
    case high = "9-12"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .middle: return "Grades 6-8"
        case .high: return "Grades 9-12"
        }
    }

    /// The grade band containing the given grade (6...12), if any.
    static func containing(grade: Int) -> GradeBand? {
        switch grade {
        case 6...8: return .middle
        case 9...12: return .high
        default: return nil
        }
    }
}

@Model
final class Scenario {
    var id: UUID
    var text: String
    var category: ScenarioCategory
    var gradeBand: GradeBand
    /// True for the hand-written offline fallback bank; false for API-generated scenarios.
    var isCurated: Bool
    var createdAt: Date

    @Relationship(deleteRule: .cascade, inverse: \ScenarioAttempt.scenario)
    var attempts: [ScenarioAttempt] = []

    init(
        id: UUID = UUID(),
        text: String,
        category: ScenarioCategory,
        gradeBand: GradeBand,
        isCurated: Bool = false,
        createdAt: Date = .now
    ) {
        self.id = id
        self.text = text
        self.category = category
        self.gradeBand = gradeBand
        self.isCurated = isCurated
        self.createdAt = createdAt
    }
}
