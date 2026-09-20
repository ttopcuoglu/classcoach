import Foundation

/// Mirrors `AssignmentCoachSession` in `web/src/lib/api.ts`. Only the fields
/// the app reads are declared — unknown keys are ignored — and every nested
/// field is optional, since Claude-produced sections can be null (a single
/// non-optional field failing to decode would hide the whole session list).
///
/// `mode` is "review" or "redesign_ai"; older rows may carry a retired
/// "create" / "improve", which the workspace shows as a Review.
struct AssignmentCoachSession: Codable, Identifiable {
    let id: String
    let mode: String
    let aiUseLevel: String?
    let assignmentType: String?
    let estimatedTime: String?
    let gradeLevel: String?
    let subject: String?
    let originalText: String?
    let liveAssignmentText: String?
    let status: String?
    let title: String?
    let conversation: [ChatMessage]
    let reviewSummary: AssignmentReviewSummary?
    let reviewSnapshot: AssignmentReviewSnapshot?
    let clarifyingQuestion: AssignmentClarifyingQuestion?
    let aiResistant: AssignmentAiResistant?
    let saved: Bool
    let createdAt: String
    let updatedAt: String?
    /// Only present on the response to "Revise the whole assignment".
    let revisionSummary: [String]?

    var isRedesign: Bool { mode == "redesign_ai" }
}

/// The older, three-part review that predates the snapshot.
struct AssignmentReviewSummary: Codable {
    let working: String?
    let needsAttention: String?
    let suggestions: String?
}

/// One area of the review. The server uses the same few keys across areas
/// (grade fit and AI risk carry a `rating`, rigor a `label`, and so on), so
/// they share a shape with everything optional.
struct AssignmentFinding: Codable {
    let rating: String?
    let label: String?
    let explanation: String?
    let suggestion: String?
    let reasons: String?
    let title: String?
    let description: String?
}

struct AssignmentReviewSnapshot: Codable {
    let purpose: String?
    let gradeFit: AssignmentFinding?
    let rigor: AssignmentFinding?
    let meaningfulWork: AssignmentFinding?
    let aiRisk: AssignmentFinding?
    let workloadSummary: String?
    let mainOpportunity: AssignmentFinding?
}

struct AssignmentClarifyingQuestion: Codable {
    let question: String
    let options: [String]
}

struct AssignmentAiRole: Codable {
    let level: String?
    let explanation: String?
    let recommended: Bool?
}

struct AssignmentAiResistant: Codable {
    let aiRole: AssignmentAiRole?
    let vulnerableSteps: String?
    let thinkingSafeguards: String?
    let guidelines: String?
    let revisedAssignment: String?
    /// Pre-existing sessions stored the safeguards under this older name.
    let strategies: String?
}

/// An arbitrary JSON value. The export preview's document / slide-deck model
/// is laid out by the server and handed straight back to it to render the
/// file, so the app never needs to look inside it.
enum JSONValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}
