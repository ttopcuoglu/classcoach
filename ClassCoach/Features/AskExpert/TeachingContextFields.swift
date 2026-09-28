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
}

struct TeachingContextFields: View {
    @Binding var value: TeachingContextValue

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

            // Only at 9-12, and only once a subject is chosen: "Math" describes
            // a 4th grade classroom, but says almost nothing about a high
            // school schedule.
            if !courses.isEmpty {
                field("Course") {
                    ChipRow(
                        items: courses.map { ($0, Optional($0)) },
                        selection: value.course
                    ) { value.course = $0 }
                }
            }

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
