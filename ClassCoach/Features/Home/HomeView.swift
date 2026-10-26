import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var authManager: AuthManager
    /// Coach's due check-in, if any — refreshed whenever Home comes back into view.
    @State private var checkIn: CoachFollowUp?
    /// When each recorded lesson was taught — drives "Your lessons this month".
    /// Nil until the first load, so the card doesn't flash "start the month".
    @State private var lessonDates: [Date]?

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let base = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        // Skip a leading honorific ("Ms. Rivera") so the greeting doesn't
        // address someone by a bare title — same rule as the web home page.
        let honorifics: Set<String> = ["mr", "mrs", "ms", "miss", "dr", "prof", "mx"]
        let first = (authManager.currentUser?.name ?? "")
            .split(separator: " ")
            .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ".")) }
            .first { !$0.isEmpty && !honorifics.contains($0.lowercased()) }
        return first.map { "\(base), \($0)" } ?? base
    }

    private var dateLabel: String {
        Date().formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(dateLabel)
                            .font(.caption2.weight(.bold)).tracking(1.4)
                            .foregroundStyle(AppTheme.gold)
                        (Text(greeting) + Text(".").foregroundColor(AppTheme.gold))
                            .font(.heading(.title))
                            .foregroundStyle(.white)
                        Text("What would help you feel more prepared today?")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))
                    .padding(.horizontal)
                    .padding(.top, 8)

                    if let checkIn {
                        checkInCard(checkIn)
                            .padding(.horizontal)
                    }

                    NavigationLink { AudioCoachingView() } label: {
                        FeatureCard(
                            eyebrow: "Lesson Reflection",
                            title: "Lesson Debrief",
                            description: "Record a class and turn classroom talk into focused, judgment-free feedback.",
                            actionLabel: "Record a lesson",
                            systemImage: "mic.fill",
                            iconTint: AppTheme.accent
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    NavigationLink { TalkToMeView() } label: {
                        FeatureCard(
                            eyebrow: "Live Coach",
                            title: "Talk It Through",
                            description: "Think out loud. Your coach listens, asks, and helps you find a next step.",
                            actionLabel: "Start voice coaching",
                            systemImage: "headphones",
                            iconTint: AppTheme.primary
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    NavigationLink { PracticeView() } label: {
                        FeatureCard(
                            eyebrow: "Safe Practice",
                            title: "Practice",
                            description: "Rehearse a classroom moment written for you and get coaching on the words you used — before you face one for real.",
                            actionLabel: "Practice a scenario",
                            systemImage: "bubble.left.and.bubble.right.fill",
                            iconTint: AppTheme.Category.disruption
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    NavigationLink { LessonPlanningView() } label: {
                        FeatureCard(
                            eyebrow: "Before Class",
                            title: "Planning Coach",
                            description: "Build a lesson from a topic, or strengthen the one you wrote — then adapt it to the class you actually have.",
                            actionLabel: "Build a lesson",
                            systemImage: "doc.text.fill",
                            iconTint: AppTheme.sage
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    // After the tools, as on the web: a recording habit to glance
                    // at, not the first thing between a teacher and Record.
                    if let lessonDates {
                        LessonMonthCard(month: LessonMonth(dates: lessonDates, now: Date()))
                            .padding(.horizontal)
                    }

                    // No card for reviewing an assignment: it is one of Planning
                    // Coach's four chips, so a card here would be a second
                    // Home tile opening the same screen a chip along. The web's
                    // Home has no assignment card either.
                }
                .padding(.vertical)
            }
            .background(AppTheme.background)
            .navigationTitle("Wivoza")
            .onAppear {
                Task { await loadCheckIn() }
                Task { await loadLessonDates() }
            }
        }
    }

    private func checkInCard(_ followUp: CoachFollowUp) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "headphones")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.gold)
                    .frame(width: 40, height: 40)
                    .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 4) {
                    Text("COACH IS CHECKING IN · \(followUp.ageLabel.uppercased())")
                        .font(.caption2.weight(.bold)).tracking(0.8)
                        .foregroundStyle(AppTheme.terracotta600)
                    Text(followUp.checkInQuestion)
                        .font(.heading(.headline))
                        .foregroundStyle(AppTheme.forest)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            NavigationLink { TalkToMeView(followUp: followUp) } label: {
                Text("Tell Coach how it went →")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
            }

            HStack(spacing: 18) {
                Button("Remind me later") { Task { await act(on: followUp, "snooze") } }
                Button("Dismiss") { Task { await act(on: followUp, "dismiss") } }
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(AppTheme.textSecondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.goldTint.opacity(0.8), in: RoundedRectangle(cornerRadius: 22))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 22, bottomLeadingRadius: 22)
                .fill(AppTheme.gold)
                .frame(width: 6)
        }
    }

    private func loadCheckIn() async {
        if let due = try? await TalkToMeService.dueFollowUps() {
            checkIn = due.first
        }
    }

    /// Lessons that were recorded — not ones started and never sent, or failed.
    private func loadLessonDates() async {
        guard let sessions = try? await AudioCoachingService.getSessions() else { return }
        lessonDates = sessions
            .filter { $0.status != "setup" && $0.status != "failed" }
            .compactMap { LessonMonth.parseDate($0.sessionDate) }
    }

    /// The card goes either way; a failed request just brings it back.
    private func act(on followUp: CoachFollowUp, _ action: String) async {
        checkIn = nil
        do {
            _ = try await TalkToMeService.updateFollowUp(id: followUp.id, action: action)
        } catch {
            checkIn = followUp
        }
    }
}

/// Home's "Your lessons this month" — mirrors `web/src/lib/lessonMonth.ts`:
/// which days this month had a lesson recorded, and how many weeks in a row
/// (ending this week, or last week if none yet this week) had at least one.
/// A habit, never a judgment of the teaching.
struct LessonMonth {
    let monthLabel: String
    /// Day of the week the 1st falls on, Monday = 0, so the grid lines up.
    let firstWeekday: Int
    let daysInMonth: Int
    let recordedDays: Set<Int>
    let count: Int
    let today: Int
    let weekStreak: Int

    init(dates: [Date], now: Date, calendar base: Calendar = .current) {
        var calendar = base
        calendar.firstWeekday = 2
        let month = calendar.dateComponents([.year, .month], from: now)
        let inMonth = dates.filter { calendar.dateComponents([.year, .month], from: $0) == month }
        func mondayOf(_ d: Date) -> Date? { calendar.dateInterval(of: .weekOfYear, for: d)?.start }
        let weeks = Set(dates.compactMap(mondayOf))
        // Walk back a calendar week at a time, so daylight saving can't
        // throw the comparison off by an hour.
        var cursor = mondayOf(now)
        if let c = cursor, !weeks.contains(c) { cursor = calendar.date(byAdding: .weekOfYear, value: -1, to: c) }
        var streak = 0
        while let c = cursor, weeks.contains(c) {
            streak += 1
            cursor = calendar.date(byAdding: .weekOfYear, value: -1, to: c)
        }
        let first = calendar.date(from: month) ?? now
        monthLabel = now.formatted(.dateTime.month(.wide)).uppercased()
        firstWeekday = (calendar.component(.weekday, from: first) + 5) % 7
        daysInMonth = calendar.range(of: .day, in: .month, for: now)?.count ?? 30
        recordedDays = Set(inMonth.map { calendar.component(.day, from: $0) })
        count = inMonth.count
        today = calendar.component(.day, from: now)
        weekStreak = streak
    }

    var streakLine: String {
        weekStreak >= 2 ? "\(weekStreak) weeks in a row with a recording."
            : count > 0 ? "Record one more this week to start a streak."
            : "Record a lesson to start the month."
    }

    static func parseDate(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}

/// The recording habit: lessons this month, the days they fell on, and weeks
/// in a row with one. Nothing here judges the teaching. Matches the web
/// Home's month card.
struct LessonMonthCard: View {
    let month: LessonMonth

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(month.monthLabel)
                .font(.caption2.weight(.bold)).tracking(1.4)
                .foregroundStyle(AppTheme.forest)
            Text("Your lessons this month")
                .font(.heading(.headline))
                .foregroundStyle(AppTheme.forest)
                .padding(.top, 4)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(month.count)")
                    .font(.heading(.largeTitle).weight(.heavy))
                    .foregroundStyle(AppTheme.forest)
                Text("lesson\(month.count == 1 ? "" : "s") recorded")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }
            .padding(.top, 10)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                // One range, so the leading blanks (day <= 0) and the days
                // never share an id in the grid.
                ForEach((1 - month.firstWeekday)...month.daysInMonth, id: \.self) { day in
                    if day <= 0 {
                        Color.clear.frame(height: 14)
                    } else {
                    let recorded = month.recordedDays.contains(day)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(recorded ? Color(hex: 0x4F9A72) : day > month.today ? AppTheme.hairline.opacity(0.4) : AppTheme.hairline)
                        .frame(height: 14)
                        .overlay {
                            if day == month.today {
                                RoundedRectangle(cornerRadius: 5)
                                    .strokeBorder(AppTheme.forest, lineWidth: 2)
                                    .padding(-3)
                            }
                        }
                    }
                }
            }
            .padding(.top, 12)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(month.count) lessons recorded this month")

            Text(month.streakLine)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)
                .padding(.top, 12)

            NavigationLink { AudioCoachingView() } label: {
                Text("Record a lesson →")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.terracotta600)
            }
            .padding(.top, 14)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.mintTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 24))
    }
}

/// Matches the web home page's feature cards: a tinted card with a solid
/// icon badge, a small eyebrow, a title, a short description and an
/// "action →" prompt.
struct FeatureCard: View {
    let eyebrow: String
    let title: String
    let description: String
    let actionLabel: String
    let systemImage: String
    let iconTint: Color

    private var cardTint: Color {
        switch iconTint {
        case AppTheme.accent: return AppTheme.peachTint.opacity(0.6)
        case AppTheme.Category.disruption: return AppTheme.goldTint.opacity(0.7)
        default: return AppTheme.mintTint.opacity(0.6)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: 50, height: 50)
                .background(iconTint, in: RoundedRectangle(cornerRadius: 15))

            Text(eyebrow.uppercased())
                .font(.caption2.weight(.bold)).tracking(1.1)
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.top, 4)

            Text(title)
                .font(.heading(.title3))
                .foregroundStyle(AppTheme.forest)

            Text(description)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Text("\(actionLabel) →")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.top, 2)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardTint, in: RoundedRectangle(cornerRadius: 24))
    }
}

#Preview {
    HomeView()
        .environmentObject(AuthManager.shared)
}
