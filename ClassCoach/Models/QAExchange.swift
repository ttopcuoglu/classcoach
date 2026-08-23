import Foundation
import SwiftData

/// A single question/answer turn from "Ask an Expert", optionally starred
/// into the teacher's personal playbook.
@Model
final class QAExchange {
    var id: UUID
    var question: String
    var answer: String
    var askedAt: Date
    var isStarred: Bool

    init(
        id: UUID = UUID(),
        question: String,
        answer: String,
        askedAt: Date = .now,
        isStarred: Bool = false
    ) {
        self.id = id
        self.question = question
        self.answer = answer
        self.askedAt = askedAt
        self.isStarred = isStarred
    }
}
