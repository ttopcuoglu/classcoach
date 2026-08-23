import Foundation
import SwiftData

/// A teacher's saved, completed practice attempt at a scenario, along with
/// the coaching feedback returned for it.
@Model
final class ScenarioAttempt {
    var id: UUID
    var scenario: Scenario?
    var userResponse: String

    /// Constructive feedback on the teacher's approach.
    var feedback: String
    /// What the teacher's response did well.
    var whatWorkedWell: String
    /// Alternative or additional strategies grounded in best practices.
    var alternativeStrategies: String
    /// A suggested model response the teacher can compare against.
    var modelResponse: String

    var completedAt: Date

    init(
        id: UUID = UUID(),
        scenario: Scenario? = nil,
        userResponse: String,
        feedback: String = "",
        whatWorkedWell: String = "",
        alternativeStrategies: String = "",
        modelResponse: String = "",
        completedAt: Date = .now
    ) {
        self.id = id
        self.scenario = scenario
        self.userResponse = userResponse
        self.feedback = feedback
        self.whatWorkedWell = whatWorkedWell
        self.alternativeStrategies = alternativeStrategies
        self.modelResponse = modelResponse
        self.completedAt = completedAt
    }
}
