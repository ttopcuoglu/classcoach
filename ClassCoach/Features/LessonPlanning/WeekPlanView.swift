import SwiftUI

// Plan a Week on the iPhone: the daily objectives to check, then the week
// filled in — in the teacher's weekly form when they have one, otherwise in
// Wivoza's own weekly layout. Any day opens as a full lesson. Mirrors
// `WeekWorkspace.tsx` on the web. The panel owns the plan and opening a day;
// filling the week in happens here.

private func sectionsText(_ sections: [LaidOutSection]) -> String {
    sections
        .map { section in
            let text = section.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? section.title : "\(section.title)\n\(text)"
        }
        .joined(separator: "\n\n")
}

struct WeekPlanView: View {
    let plan: LessonPlan
    /// The week after it was filled in.
    let onPlan: (LessonPlan) -> Void
    let onNew: () -> Void
    let onOpenDay: (Int) -> Void
    /// The day being built as a full lesson, while it is.
    let openingDay: Int?
    let dayError: String?
    let onToggleSaved: () -> Void

    @State private var editing = false
    @State private var drafts: [String] = []
    @State private var filling = false
    @State private var error: String?
    @State private var weekly: [LessonTemplate]?
    @State private var formatChoice: String?
    @State private var formatsOpen = false

    private var week: WeekPlan? { plan.week }
    private var content: WeekContent? { week?.content }
    private var showingObjectives: Bool { editing || content == nil }
    private var allObjectives: Bool {
        !drafts.isEmpty && drafts.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    /// The format the week will be filled in with: the one picked if it is
    /// still a weekly format, otherwise the first weekly one, otherwise Wivoza's.
    private var formatValue: String {
        guard let weekly, !weekly.isEmpty else { return "wivoza" }
        if let formatChoice, formatChoice == "wivoza" || weekly.contains(where: { $0.id == formatChoice }) {
            return formatChoice
        }
        return weekly[0].id
    }

    private var formatName: String {
        weekly?.first(where: { $0.id == formatValue })?.name ?? "Wivoza weekly layout"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            if showingObjectives {
                objectivesSection
            } else if let content {
                weekSection(content)
            }
        }
        .task(id: plan.id) {
            drafts = (week?.days ?? []).map(\.objective)
            editing = content == nil
            formatChoice = content.map { $0.templateId ?? "wivoza" } ?? plan.templateChoice
            error = nil
            await loadFormats()
        }
        .sheet(isPresented: $formatsOpen) {
            LessonFormatsSheet { Task { await loadFormats() } }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                let meta = [plan.subject, plan.gradeLevel].compactMap { $0 }.joined(separator: " · ")
                let days = week?.days.count ?? 0
                Text((["Plan a Week", meta, "\(days) \(days == 1 ? "day" : "days")"].filter { !$0.isEmpty }).joined(separator: " · ").uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.primary)
                Spacer()
                Button("+ New plan", action: onNew)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.forest)
            }
            Text(plan.objective?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Your week")
                .font(.title3.weight(.bold))
                .foregroundStyle(AppTheme.forest)
                .fixedSize(horizontal: false, vertical: true)
            if let content, !editing {
                HStack(spacing: 8) {
                    Button(action: onToggleSaved) {
                        Label(plan.saved ? "Saved" : "Save for Later", systemImage: plan.saved ? "star.fill" : "star")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(plan.saved ? AppTheme.cream : AppTheme.forest)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(plan.saved ? AppTheme.forest : AppTheme.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(AppTheme.hairline))
                    }
                    .buttonStyle(.plain)
                    CopyButton(label: "Copy week") { wholeWeek(content) }
                    Button("Change objectives") { editing = true }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                }
            }
        }
    }

    private func wholeWeek(_ content: WeekContent) -> String {
        var parts: [String] = [plan.objective ?? "Your week"]
        let meta = [plan.subject, plan.gradeLevel].compactMap { $0 }.joined(separator: " · ")
        if !meta.isEmpty { parts.append(meta) }
        if !content.shared.isEmpty { parts.append("THIS WEEK\n\n" + sectionsText(content.shared)) }
        for day in content.days { parts.append(day.label.uppercased() + "\n\n" + sectionsText(day.sections)) }
        return parts.joined(separator: "\n\n")
    }

    // MARK: Format

    @ViewBuilder
    private var formatPicker: some View {
        if let weekly {
            HStack(spacing: 8) {
                Text("FORMAT").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.textSecondary)
                if weekly.isEmpty {
                    Text("Wivoza weekly layout").font(.footnote).foregroundStyle(AppTheme.forest)
                } else {
                    Menu {
                        ForEach(weekly) { template in
                            Button { pick(template.id) } label: {
                                if template.id == formatValue { Label(template.name, systemImage: "checkmark") } else { Text(template.name) }
                            }
                        }
                        Button { pick("wivoza") } label: {
                            if formatValue == "wivoza" { Label("Wivoza weekly layout", systemImage: "checkmark") } else { Text("Wivoza weekly layout") }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(formatName).lineLimit(1)
                            Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                        }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                    }
                    .disabled(filling)
                }
                Spacer(minLength: 4)
                Button(weekly.isEmpty ? "Use your weekly form" : "Manage formats") { formatsOpen = true }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.forest)
            }
        }
    }

    /// Picking a format for a week already filled in fills it in again in that
    /// format; before then it is only the choice for the first fill.
    private func pick(_ choice: String) {
        formatChoice = choice
        if content != nil && !editing { Task { await fill(choice) } }
    }

    private func loadFormats() async {
        if let all = try? await LessonFormatService.list() {
            weekly = (all.personal + all.school).filter { $0.cadence == "weekly" }
        } else {
            weekly = []
        }
    }

    private func fill(_ choice: String) async {
        guard !filling else { return }
        filling = true
        error = nil
        do {
            let updated = try await LessonPlanningService.fillWeek(
                id: plan.id,
                objectives: drafts.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) },
                choice: choice
            )
            onPlan(updated)
            editing = false
        } catch {
            self.error = error.localizedDescription
        }
        filling = false
    }

    // MARK: Objectives

    private var objectivesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Your daily objectives").font(.headline).foregroundStyle(AppTheme.forest)
                Text(content != nil
                     ? "Change any day, then fill the week in again. Days you change lose the full lesson opened from them."
                     : "Each day builds on the one before. Change anything that is wrong for your class, then fill in the week.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array((week?.days ?? []).enumerated()), id: \.offset) { index, day in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(day.label).font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                        Text("\(day.minutes) min")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.forest)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(AppTheme.goldTint, in: Capsule())
                        if let note = day.note, !note.isEmpty {
                            Text("Your note: \(note)")
                                .font(.caption)
                                .foregroundStyle(AppTheme.forest)
                                .lineLimit(1)
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(AppTheme.mintTint, in: Capsule())
                        }
                    }
                    TextEditor(text: binding(index))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 64)
                        .padding(6)
                        .background(AppTheme.cream.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(AppTheme.hairline))
                        .disabled(filling)
                        .accessibilityLabel("\(day.label) objective")
                }
                .padding(12)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
            }
            formatPicker
            ProgressRing(active: filling, estimatedSeconds: 30, label: "Filling in your week", hint: "Every day, in your form's boxes. About half a minute.")
            if !filling {
                HStack(spacing: 10) {
                    Button {
                        Task { await fill(formatValue) }
                    } label: {
                        Text(content != nil ? "Fill in the week again" : "Fill in the week")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(allObjectives ? AppTheme.forest : AppTheme.forest.opacity(0.4), in: Capsule())
                    }
                    .disabled(!allObjectives)
                    if content != nil {
                        Button("Cancel") {
                            drafts = (week?.days ?? []).map(\.objective)
                            editing = false
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                    }
                }
            }
            if let error { errorText(error) }
        }
    }

    private func binding(_ index: Int) -> Binding<String> {
        Binding(
            get: { index < drafts.count ? drafts[index] : "" },
            set: { if index < drafts.count { drafts[index] = $0 } }
        )
    }

    // MARK: The week, filled in

    private func weekSection(_ content: WeekContent) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Your week").font(.headline).foregroundStyle(AppTheme.forest)
                Text("In \(content.templateName). Copy a day, or the whole week. Open any day as a full lesson.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            formatPicker
            ProgressRing(active: filling, estimatedSeconds: 30, label: "Filling in your week", hint: "Every day, in your form's boxes. About half a minute.")
            if let error { errorText(error) }

            if !content.shared.isEmpty {
                card(title: "This week", trailing: AnyView(CopyButton(label: "Copy") { sectionsText(content.shared) })) {
                    LaidOutSectionList(sections: content.shared, emptyText: "Nothing for this.", framed: false)
                }
            }

            ForEach(Array(content.days.enumerated()), id: \.offset) { index, day in
                let info = index < (week?.days.count ?? 0) ? week?.days[index] : nil
                card(title: day.label + (info.map { "  ·  \($0.minutes) min" } ?? ""), trailing: AnyView(dayActions(index: index, day: day, info: info))) {
                    VStack(alignment: .leading, spacing: 0) {
                        if openingDay == index {
                            ProgressRing(active: true, estimatedSeconds: 22, label: "Building \(day.label)'s lesson", hint: "From this day's plan, with the rest of the week in mind.")
                                .padding(14)
                        }
                        LaidOutSectionList(sections: day.sections, emptyText: "Nothing for this day.", framed: false)
                    }
                }
            }
            if let dayError { errorText(dayError) }
            Text("A draft to edit, not a script. You know your class; change whatever needs changing.")
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func dayActions(index: Int, day: WeekContentDay, info: WeekDay?) -> some View {
        HStack(spacing: 6) {
            CopyButton(label: "Copy day") { day.label.uppercased() + "\n\n" + sectionsText(day.sections) }
            Button {
                onOpenDay(index)
            } label: {
                Text(openingDay == index ? "Building…" : (info?.lessonPlanId != nil ? "Open lesson" : "Open as lesson"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.cream)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(AppTheme.forest, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(openingDay != nil)
        }
    }

    private func card<Content: View>(title: String, trailing: AnyView, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                trailing
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.mintTint.opacity(0.6))
            Divider().overlay(AppTheme.hairline)
            content()
        }
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.hairline))
    }

    private func errorText(_ message: String) -> some View {
        Text(message)
            .font(.footnote)
            .foregroundStyle(AppTheme.forest)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.peachTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
    }
}
