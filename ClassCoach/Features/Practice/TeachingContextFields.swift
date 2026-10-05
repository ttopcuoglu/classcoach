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
    /// What they are teaching right now. Free text, and the only room field
    /// that changes weekly — so it is never defaulted or remembered.
    var topic: String?
    var courseLevel: String?
    /// Who is in the room — multi-select, separate from the level.
    var makeup: [String] = []
    /// The teacher picked "Other"; the free-text field then owns `subject`.
    var usingOtherSubject = false
    /// Same, for the course — middle school naming varies by district.
    var usingOtherCourse = false

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
    /// section — a K-2 room and a 9-12 room differ whether the question is
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
                    // A course list is band-specific, so changing band drops
                    // the course. The topic survives on purpose: photosynthesis
                    // is taught in 6-8 Science as well as 9-12 Biology, so
                    // moving band is not a contradiction the way changing
                    // subject is.
                    value.course = nil
                    value.usingOtherCourse = false
                    // AP does not exist below 9-12, so a level the new band does
                    // not offer goes rather than travelling with them.
                    if !courseLevelsFor(value.gradeBand).contains(value.courseLevel ?? "") {
                        value.courseLevel = nil
                    }
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
                    value.usingOtherCourse = false
                    // A topic belongs to a subject. Keeping it across a subject
                    // change lets the two contradict each other, and the server
                    // cannot catch it because the topic is free text.
                    value.topic = nil
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
                        items: courses.map { ($0, Optional($0)) } + [(otherCourseLabel, Optional(otherCourseLabel))],
                        selection: value.usingOtherCourse ? otherCourseLabel : value.course
                    ) { picked in
                        value.usingOtherCourse = picked == otherCourseLabel
                        value.course = value.usingOtherCourse ? nil : picked
                    }
                    if value.usingOtherCourse {
                        TextField("What's it called?", text: Binding(
                            get: { value.course ?? "" },
                            set: { value.course = $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
                        ))
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal)
                    }
                }
            }

            // Subject and course say what room this is; topic says what is
            // happening in it this week. Practice has no other channel for it —
            // a teacher types nothing before a scenario is generated — so
            // without this the model picks the topic.
            if showSubjectAndLevel {
                field("Topic or unit (optional)") {
                    TextField("What are you teaching right now?", text: Binding(
                        get: { value.topic ?? "" },
                        set: { value.topic = $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)
                    if let topic = value.topic {
                        Text("Scenarios and coaching will be about \(topic).")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                            .padding(.horizontal)
                    }
                }
            }

            if showSubjectAndLevel, !courseLevelsFor(value.gradeBand).isEmpty {
                field("Level") {
                    ChipRow(
                        items: courseLevelsFor(value.gradeBand).map { ($0, Optional($0)) },
                        selection: value.courseLevel
                    ) { value.courseLevel = $0 }
                    if let l = value.courseLevel, let blurb = courseLevelBlurb[l] {
                        Text(blurb)
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                            .padding(.horizontal)
                    }
                }
            }

            // Multi-select, and separate from the level — a teacher with both
            // would otherwise have to pick, and the coach would see a third of
            // their room.
            if showSubjectAndLevel {
                field("Who's in the room (any that apply)") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(classMakeup, id: \.value) { item in
                                let on = value.makeup.contains(item.value)
                                Button(item.label) {
                                    if on { value.makeup.removeAll { $0 == item.value } }
                                    else { value.makeup.append(item.value) }
                                }
                                .font(.subheadline.weight(on ? .semibold : .medium))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .foregroundStyle(on ? AppTheme.cream : AppTheme.textSecondary)
                                .background(on ? AppTheme.forest : AppTheme.card, in: Capsule())
                                .overlay(Capsule().strokeBorder(on ? .clear : AppTheme.hairline))
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                        .padding(.horizontal)
                    }
                    if !value.makeup.isEmpty {
                        Text(value.makeup.compactMap { classMakeupBlurb[$0] }.joined(separator: " "))
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal)
                    }
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
