import SwiftUI

/// The teacher's room, shared by Ask and Practice because both need the same
/// four answers and they have to agree. Mirrors
/// `web/src/components/TeachingContextFields.tsx`.
///
/// Always visible — this used to sit behind a "Change" fold, which made the
/// room look optional. It isn't: it's what separates coaching about a 4th grade
/// math lesson from coaching about an AP Calculus section.
struct TeachingContextValue: Equatable {
    var gradeBand = "6-8"
    var subject: String?
    /// 9-12 only — the course a subject splits into (Algebra 2, Chemistry).
    var course: String?
    var courseLevel: String?
    /// The teacher picked "Other"; the free-text field then owns `subject`.
    var usingOtherSubject = false

    /// Defaults from the teacher's profile, once. Called by whoever owns the
    /// room — the Ask & Practice shell, or a standalone tab.
    mutating func seed(from user: User?) {
        guard let user, !seeded else { return }
        seeded = true
        gradeBand = bandFromProfile(user.gradeLevels)
        if subject == nil, let mapped = subjectFromProfile(user.subjects) {
            subject = mapped
            // A profile subject that isn't one of the six lands in "Other".
            usingOtherSubject = !subjects.contains(mapped)
        }
    }

    private var seeded = false
}

struct TeachingContextFields: View {
    /// Subject, course and level open only under Teaching and Learning, where
    /// they're what the coaching is about. Grade band is asked for every
    /// section — a K-5 room and a 9-12 room differ whether the question is
    /// about behavior, a parent, or a colleague.
    var focusArea: String?
    @Binding var value: TeachingContextValue

    private var showSubjectAndLevel: Bool { focusArea == teachingAndLearning }

    private var courses: [String] {
        coursesFor(gradeBand: value.gradeBand, subject: value.usingOtherSubject ? nil : value.subject)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            field("Grade band") {
                ChipRow(items: gradeBandChips, selection: value.gradeBand) { picked in
                    value.gradeBand = picked ?? "6-8"
                    // Courses belong to 9-12, so leaving that band drops the
                    // course rather than silently sending a stale one.
                    if value.gradeBand != "9-12" { value.course = nil }
                }
            }

            if showSubjectAndLevel {
            field("Subject") {
                ChipRow(
                    items: subjects.map { ($0, Optional($0)) } + [(otherSubjectLabel, Optional(otherSubjectLabel))],
                    selection: value.usingOtherSubject ? otherSubjectLabel : value.subject
                ) { picked in
                    value.usingOtherSubject = picked == otherSubjectLabel
                    value.subject = value.usingOtherSubject ? nil : picked
                    value.course = nil
                }
                if value.usingOtherSubject {
                    TextField("Which subject?", text: Binding(
                        get: { value.subject ?? "" },
                        set: { value.subject = $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)
                }
            }
            }

            // Only at 9-12, and only once a subject is chosen: "Math" describes
            // a 4th grade classroom, but says almost nothing about a high
            // school schedule.
            if showSubjectAndLevel, !courses.isEmpty {
                field("Course") {
                    ChipRow(
                        items: courses.map { ($0, Optional($0)) },
                        selection: value.course
                    ) { value.course = $0 }
                }
            }

            if showSubjectAndLevel {
            field("Level") {
                ChipRow(
                    items: courseLevels.map { ($0, Optional($0)) },
                    selection: value.courseLevel
                ) { value.courseLevel = $0 }
                Text(
                    value.courseLevel.flatMap { courseLevelBlurb[$0] }
                        ?? "Changes the coaching more than anything else here — an inclusion section and an AP section are different jobs."
                )
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal)
            }
            }
        }
        .padding(.vertical, 12)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.caption2.weight(.bold)).tracking(0.8)
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.horizontal)
            content()
        }
    }
}
