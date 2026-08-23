import Foundation
import SwiftData

/// The single local teacher profile used to personalize content. No auth in
/// v1 — expect at most one instance to exist at a time.
@Model
final class UserProfile {
    var id: UUID
    var name: String
    /// The specific grades (6...12) this teacher teaches.
    var gradeLevels: [Int]
    var subjects: [String]
    var notificationsEnabled: Bool
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String = "",
        gradeLevels: [Int] = [],
        subjects: [String] = [],
        notificationsEnabled: Bool = true,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.gradeLevels = gradeLevels
        self.subjects = subjects
        self.notificationsEnabled = notificationsEnabled
        self.createdAt = createdAt
    }

    /// The grade bands this profile's grade levels fall into — used to
    /// surface grade-relevant scenarios first.
    var gradeBands: Set<GradeBand> {
        Set(gradeLevels.compactMap(GradeBand.containing(grade:)))
    }
}
