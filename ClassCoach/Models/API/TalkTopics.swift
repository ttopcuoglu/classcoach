import Foundation

/// The topic taxonomy and starter prompts behind Talk It Through's start
/// screen, ported from `web/src/lib/topics.ts` and `web/src/lib/starters.ts`.
///
/// Transcribed mechanically from those files rather than retyped, and the
/// counts were checked against them, so the two clients offer a teacher the
/// same words. If the web lists change, regenerate rather than hand-patch.

struct TalkTopicKind: Identifiable, Hashable {
    let value: String
    let label: String
    var id: String { value }
}

struct TalkTopic: Identifiable, Hashable {
    let value: String
    let label: String
    let kinds: [TalkTopicKind]
    var id: String { value }
}

/// "Something else" deliberately has no second step: it means "I do not want to
/// classify this", so asking a narrowing question would be contradicting the
/// teacher who just picked it.
let talkTopics: [TalkTopic] = [
    TalkTopic(
        value: "teaching_and_learning",
        label: "Teaching and Learning",
        kinds: [
            TalkTopicKind(value: "questioning_discussion", label: "Questioning and discussion"),
            TalkTopicKind(value: "explaining_clearly", label: "Explaining a tough concept"),
            TalkTopicKind(value: "misconceptions", label: "A misconception in the room"),
            TalkTopicKind(value: "feedback_and_grading", label: "Feedback and grading"),
            TalkTopicKind(value: "checking_understanding", label: "Checking for understanding"),
            TalkTopicKind(value: "pacing_chunking", label: "Pacing and time"),
        ]
    ),
    TalkTopic(
        value: "classroom_management",
        label: "Classroom Management",
        kinds: [
            TalkTopicKind(value: "disengagement", label: "Engagement and participation"),
            TalkTopicKind(value: "defiance", label: "Behavior in the moment"),
            TalkTopicKind(value: "transitions", label: "Routines and transitions"),
            TalkTopicKind(value: "technology_misuse", label: "Phones and devices"),
            TalkTopicKind(value: "group_work_breakdown", label: "Group work breaking down"),
        ]
    ),
    TalkTopic(
        value: "student_concern",
        label: "A student I'm worried about",
        kinds: [
            TalkTopicKind(value: "student_check_in", label: "The check-in"),
            TalkTopicKind(value: "looping_in_counselor", label: "Looping in the counselor"),
            TalkTopicKind(value: "call_home", label: "The call home"),
            TalkTopicKind(value: "documenting_concern", label: "Writing down what you're seeing"),
        ]
    ),
    TalkTopic(
        value: "parent_communication",
        label: "Parent Communication",
        kinds: [
            TalkTopicKind(value: "delivering_hard_news", label: "Delivering hard news"),
            TalkTopicKind(value: "difficult_parent_email", label: "Angry or accusatory"),
            TalkTopicKind(value: "grade_dispute", label: "Grade dispute"),
            TalkTopicKind(value: "attendance", label: "Attendance"),
            TalkTopicKind(value: "parent_boundary", label: "Setting a boundary"),
        ]
    ),
    TalkTopic(
        value: "professionalism",
        label: "Professionalism",
        kinds: [
            TalkTopicKind(value: "talking_with_admin", label: "Talking with admin"),
            TalkTopicKind(value: "co_teaching", label: "Co-teacher friction"),
            TalkTopicKind(value: "disagreeing_with_a_peer", label: "Department disagreement"),
            TalkTopicKind(value: "post_observation", label: "Post-observation"),
        ]
    ),
    TalkTopic(
        value: "self_and_job",
        label: "Me and this job",
        kinds: [
            TalkTopicKind(value: "saying_no", label: "Saying no"),
            TalkTopicKind(value: "asking_for_help", label: "Asking for help"),
            TalkTopicKind(value: "self_boundary", label: "Setting a boundary"),
            TalkTopicKind(value: "workload_concern", label: "Raising a workload concern"),
        ]
    ),
    TalkTopic(
        value: "something_else",
        label: "Something else",
        kinds: []
    ),
]

let somethingElseTopic = "something_else"

func talkTopic(_ value: String?) -> TalkTopic? {
    guard let value else { return nil }
    return talkTopics.first { $0.value == value }
}

func talkTopicLabel(_ value: String?) -> String? { talkTopic(value)?.label }

func talkKinds(for topic: String?) -> [TalkTopicKind] { talkTopic(topic)?.kinds ?? [] }

func talkKindLabel(_ kind: String?) -> String? {
    guard let kind else { return nil }
    for topic in talkTopics where topic.kinds.contains(where: { $0.value == kind }) {
        return topic.kinds.first { $0.value == kind }?.label
    }
    return nil
}

struct TalkStarter {
    let text: String
    var bands: [String] = []
    var subjects: [String] = []
    var levels: [String] = []
    var makeup: [String] = []
}

private let startersByTopic: [String: [TalkStarter]] = [
    "teaching_and_learning": [
        TalkStarter(text: "I can't cover the syllabus and still go deep enough.", levels: ["AP"]),
        TalkStarter(text: "My strongest students coast until the exam panics them.", levels: ["AP"]),
        TalkStarter(text: "They do everything I ask and I still am not sure they are learning.", levels: ["Honors"]),
        TalkStarter(text: "The range of readiness in one room is about four years wide.", levels: ["Regular"]),
        TalkStarter(text: "My co-teacher and I are not really splitting the teaching.", makeup: ["inclusion"]),
        TalkStarter(text: "I am modifying this five different ways and teaching it once.", makeup: ["inclusion"]),
        TalkStarter(text: "The accommodations are in place and the work is still out of reach.", makeup: ["inclusion"]),
        TalkStarter(text: "They understand the idea and cannot get it into English on the page.", makeup: ["english_learners"]),
        TalkStarter(text: "I cannot tell whether it is the concept or the vocabulary stopping them.", makeup: ["english_learners"]),
        TalkStarter(text: "My {course} students can do the procedure but cannot say why it works.", subjects: ["Math"]),
        TalkStarter(text: "They freeze the moment a problem does not look like my example.", subjects: ["Math"]),
        TalkStarter(text: "They can summarize what they read but they cannot analyze it.", subjects: ["ELA"]),
        TalkStarter(text: "My discussions stay at plot level and never get past it.", subjects: ["ELA"]),
        TalkStarter(text: "They memorize the {course} vocabulary and miss the concept underneath.", subjects: ["Science"]),
        TalkStarter(text: "My labs are fun and I am not convinced anyone learns from them.", subjects: ["Science"]),
        TalkStarter(text: "They treat every source as equally trustworthy.", subjects: ["History/SS"]),
        TalkStarter(text: "It comes out as a list of dates instead of causes.", subjects: ["History/SS"]),
        TalkStarter(text: "They can follow the tutorial and cannot do it on their own.", subjects: ["Technology"]),
        TalkStarter(text: "Half the room is years ahead and half has never touched this.", subjects: ["Technology"]),
        TalkStarter(text: "I cannot get them past \"I am just not good at this.\"", subjects: ["Fine Arts"]),
        TalkStarter(text: "Critique turns into \"it is nice\" and stops there.", subjects: ["Fine Arts"]),
        TalkStarter(text: "They can do it with me and not on their own.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "They finish at wildly different times and I lose the room.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "They can read every word on the page and not tell me what it meant.", bands: ["3-5"]),
        TalkStarter(text: "They can do it right after I show them and not twenty minutes later.", bands: ["K-2"]),
        TalkStarter(text: "They will do the work but they will not explain their thinking.", bands: ["6-8"]),
        TalkStarter(text: "They can pass my test and still not understand it.", bands: ["9-12"]),
        TalkStarter(text: "I explain something well and half the room still doesn't have it."),
        TalkStarter(text: "The same three students answer every question I ask."),
        TalkStarter(text: "I can't tell if my grades are fair or just consistent."),
        TalkStarter(text: "I run out of time before the part that actually matters."),
    ],
    "classroom_management": [
        TalkStarter(text: "Lining up takes five minutes every single time.", bands: ["K-2"]),
        TalkStarter(text: "Two of mine cannot sit anywhere near each other.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "Tattling has taken over my whole morning.", bands: ["K-2"]),
        TalkStarter(text: "Group work turns into two doing it and three watching.", bands: ["3-5"]),
        TalkStarter(text: "A student pushed back in front of everyone and I froze.", bands: ["6-8"]),
        TalkStarter(text: "The side conversations start the second I stop talking.", bands: ["6-8"]),
        TalkStarter(text: "Phones keep coming out no matter what I say.", bands: ["6-8", "9-12"]),
        TalkStarter(text: "Half of them walk in late and it is contagious.", bands: ["9-12"]),
        TalkStarter(text: "A student challenged me in front of the class and had a point.", bands: ["9-12"]),
        TalkStarter(text: "They are perfectly compliant and completely checked out.", bands: ["9-12"]),
        TalkStarter(text: "My class talks over directions."),
        TalkStarter(text: "My routines work but they've gone stale."),
        TalkStarter(text: "Getting started takes five minutes every single day."),
    ],
    "parent_communication": [
        TalkStarter(text: "A parent wants a daily report and I cannot sustain it.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "A parent is upset about something at recess that I did not see.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "A parent says their child is being singled out.", bands: ["6-8"]),
        TalkStarter(text: "A parent only ever hears from me when something is wrong.", bands: ["6-8"]),
        TalkStarter(text: "A parent is contesting a grade that affects a GPA.", bands: ["9-12"]),
        TalkStarter(text: "A parent emailed my principal before they emailed me.", bands: ["9-12"]),
        TalkStarter(text: "A parent email is stressing me out."),
        TalkStarter(text: "I have to tell a parent something they won't want to hear."),
        TalkStarter(text: "A conference is coming up and I'm dreading it."),
    ],
    "professionalism": [
        TalkStarter(text: "My grade-level team does everything together and I want to try something else.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "My department wants a common assessment I do not think fits my kids.", bands: ["9-12"]),
        TalkStarter(text: "My co-teacher keeps overriding me in front of students."),
        TalkStarter(text: "I need to raise a concern with someone more senior than me."),
        TalkStarter(text: "Our team meetings never get to the work we planned."),
        TalkStarter(text: "I'm behind on paperwork and it's starting to show."),
    ],
    "student_concern": [
        TalkStarter(text: "One of mine has started crying most mornings.", bands: ["K-2"]),
        TalkStarter(text: "A student has stopped playing with anyone at recess.", bands: ["K-2", "3-5"]),
        TalkStarter(text: "A student who used to talk to me has gone quiet.", bands: ["3-5", "6-8"]),
        TalkStarter(text: "A student who was doing fine has dropped off a cliff.", bands: ["9-12"]),
        TalkStarter(text: "A student is falling asleep in my class most days.", bands: ["6-8", "9-12"]),
        TalkStarter(text: "One of mine has stopped turning anything in."),
        TalkStarter(text: "A student said something in passing that has stayed with me."),
        TalkStarter(text: "I'm worried about a student and I'm not sure who to tell."),
        TalkStarter(text: "I need to write down what I've been noticing about a student."),
    ],
    "self_and_job": [
        TalkStarter(text: "I'm taking work home every single night."),
        TalkStarter(text: "I said yes to something I shouldn't have."),
        TalkStarter(text: "I need to ask for help and I do not know how to start."),
        TalkStarter(text: "I have been asked to take on one more thing."),
        TalkStarter(text: "I'm not sure I can keep this up."),
        TalkStarter(text: "My weekends have stopped being weekends.", bands: ["6-8", "9-12"]),
        TalkStarter(text: "I am doing a job nobody actually assigned me."),
    ],
]

private let generalStarters: [TalkStarter] = [
    TalkStarter(text: "Lining up takes five minutes every single time.", bands: ["K-2"]),
    TalkStarter(text: "They can do it with me and not on their own.", bands: ["K-2", "3-5"]),
    TalkStarter(text: "The side conversations start the second I stop talking.", bands: ["6-8"]),
    TalkStarter(text: "They will do the work but they will not explain their thinking.", bands: ["6-8"]),
    TalkStarter(text: "They are perfectly compliant and completely checked out.", bands: ["9-12"]),
    TalkStarter(text: "A parent is contesting a grade that affects a GPA.", bands: ["9-12"]),
    TalkStarter(text: "My class talks over directions."),
    TalkStarter(text: "I explain something well and half the room still doesn't have it."),
    TalkStarter(text: "A parent email is stressing me out."),
    TalkStarter(text: "My co-teacher keeps overriding me in front of students."),
]

/// Shown to a teacher six or more years in who has picked no topic —
/// refining what already works rather than getting through the week.
private let experiencedStarters: [TalkStarter] = [
    TalkStarter(text: "I want to think through why a strong lesson fell flat."),
    TalkStarter(text: "My discussions could go deeper."),
    TalkStarter(text: "I'm mentoring a newer teacher and want to help well."),
    TalkStarter(text: "I want to try something new this unit."),
    TalkStarter(text: "I have a colleague I need to say something difficult to."),
    TalkStarter(text: "I am carrying more than I should be and nobody asked me to."),
]

/// A course name drops into a sentence as written ("my Algebra 2 students"); a
/// bare subject label does not, so subjects get a spoken form.
private let subjectInASentence: [String: String] = [
    "ELA": "English", "Math": "math", "Science": "science",
    "History/SS": "history", "Technology": "tech", "Fine Arts": "art",
]

/// Nil means the starter does not apply to this room at all. A higher number
/// means it is more specific, and specific ones are offered first.
private func specificity(_ s: TalkStarter, room: TeachingContextValue, area: String?) -> Int? {
    let teachingAndLearning = area == "teaching_and_learning"
    if !s.makeup.isEmpty {
        guard teachingAndLearning, s.makeup.contains(where: { room.makeup.contains($0) }) else { return nil }
    }
    var score = 0
    if !s.bands.isEmpty {
        guard s.bands.contains(room.gradeBand) else { return nil }
        score += 1
    }
    // Subject and level are only asked under Teaching and Learning, so a
    // starter depending on them cannot apply anywhere else.
    if !s.subjects.isEmpty {
        guard teachingAndLearning, let subject = room.subject, s.subjects.contains(subject) else { return nil }
        score += 1
    }
    if !s.makeup.isEmpty { score += 1 }
    if !s.levels.isEmpty {
        guard teachingAndLearning, let level = room.courseLevel, s.levels.contains(level) else { return nil }
        score += 1
    }
    return score
}

private func fill(_ text: String, room: TeachingContextValue, area: String?) -> String {
    guard area == "teaching_and_learning" else { return text.replacingOccurrences(of: "{course}", with: "this unit") }
    let named = room.course ?? room.subject.map { subjectInASentence[$0] ?? $0 }
    return text.replacingOccurrences(of: "{course}", with: named ?? "this unit")
}

let talkStarterCount = 4

/// Starters for Talk It Through: the chosen topic's own, or a cross-topic list
/// when the teacher skipped the chips. Most specific first, and ties keep their
/// written order — the general ones are ordered by how often teachers bring
/// them.
func pickTopicStarters(
    topic: String?,
    room: TeachingContextValue,
    experienced: Bool = false,
    count: Int = talkStarterCount
) -> [String] {
    let chosen = (topic != nil && topic != somethingElseTopic) ? startersByTopic[topic!] : nil
    let all = chosen ?? (experienced ? experiencedStarters : generalStarters)
    let scored = all
        .compactMap { s -> (TalkStarter, Int)? in
            guard let score = specificity(s, room: room, area: topic) else { return nil }
            return (s, score)
        }
        .enumerated()
        .sorted { ($0.element.1, -$0.offset) > ($1.element.1, -$1.offset) }
        .map { $0.element.0 }

    var seen = Set<String>()
    var out: [String] = []
    for s in scored {
        let text = fill(s.text, room: room, area: topic)
        if seen.contains(text) { continue }
        seen.insert(text)
        out.append(text)
        if out.count == count { break }
    }
    return out
}
