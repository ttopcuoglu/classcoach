import SwiftUI

// The four Insights sections in the card design — mirrors TalkParticipationTab,
// QuestioningCheckingTab, LessonContentTab and ClimateRoutinesTab in
// AudioCoaching.tsx. Every section shares one frame (SectionCard): the header
// inside a white card, the coach note, the section's own content, Keep and
// Try next time, and a footer with "How to read this", "The hard look" and
// the coach.

// MARK: - Shared pieces

/// What to keep: one of your own moves from this lesson, said plainly.
struct KeepLine {
    let text: String
    let quote: String
    let timestampSec: Double
}

/// A moment in your own words, labelled with what it was.
struct EvidenceLine: Identifiable {
    let id = UUID()
    let tag: String
    var text: String? = nil
    var quote: String? = nil
    var timestampSec: Double? = nil
}

private let mmss = ReportConfidence.formatDuration

/// The frame every section shares.
struct SectionCard<Content: View>: View {
    let section: InsightsSection
    let note: String?
    let keep: KeepLine?
    let tryNext: String?
    var tryGoal: String? = nil
    let howToRead: [String]
    let hardLook: AnyView?
    let onDiscuss: () -> Void
    @ViewBuilder let content: Content

    @State private var panel: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            InsightsSectionHeader(section: section)
            // One sentence of the note on the phone; the rest behind Read more.
            CoachNoteView(text: note?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty, sentences: 1)
            content
            KeepAndTryView(keep: keep, tryNext: tryNext, tryGoal: tryGoal)
            footer
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(AppTheme.hairline))
        .environment(\.reportAccent, section.accent)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            HStack(spacing: 8) {
                footerButton("read", "How to read this")
                if hardLook != nil { footerButton("hard", "The hard look") }
            }
            Button(action: onDiscuss) {
                Text("Discuss with Wivoza Coach \u{2192}")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
            }
            if panel == "read" {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(howToRead, id: \.self) { readingNote($0) }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 16))
            } else if panel == "hard", let hardLook {
                hardLook
            }
        }
    }

    private func footerButton(_ key: String, _ label: String) -> some View {
        let on = panel == key
        return Button {
            withAnimation { panel = on ? nil : key }
        } label: {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(on ? AppTheme.forest : AppTheme.textPrimary)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? AppTheme.forest : AppTheme.hairline))
        }
        .buttonStyle(.plain)
    }
}

/// Keep and Try next time, one above the other on a phone.
struct KeepAndTryView: View {
    let keep: KeepLine?
    let tryNext: String?
    var tryGoal: String? = nil

    var body: some View {
        let tryText = tryNext?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        if keep != nil || tryText != nil {
            VStack(alignment: .leading, spacing: 10) {
                if let keep {
                    let words = keep.quote.split(whereSeparator: \.isWhitespace)
                    let quote = words.count > 25 ? words.prefix(25).joined(separator: " ") + "\u{2026}" : keep.quote
                    VStack(alignment: .leading, spacing: 5) {
                        Text("KEEP").font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(AppTheme.forest)
                        Text(keep.text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        (Text("\u{201C}\(Redaction.withoutAddressedNames(quote))\u{201D} ")
                            + Text(mmss(keep.timestampSec)).font(.caption.monospacedDigit()))
                            .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.mintTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
                }
                if let tryText {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("TRY NEXT TIME").font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(AppTheme.terracotta600)
                        Text(tryText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        if let tryGoal {
                            Text(tryGoal).font(.subheadline).foregroundStyle(Color(hex: 0x6E4A3A))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.peachTint, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }
}

/// A title and count over a dashed rule, as each part of a section opens.
struct PartHeading: View {
    let title: String
    var count: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Rectangle().fill(.clear).frame(height: 1)
                .overlay(Rectangle().stroke(AppTheme.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.heading(.title3)).foregroundStyle(AppTheme.forest)
                Spacer()
                if let count { Text(count).font(.subheadline).foregroundStyle(AppTheme.textSecondary) }
            }
        }
    }
}

/// One moment as a row: what it was, your words, and when.
struct EvidenceRow: View {
    let line: EvidenceLine
    var fill: Color = AppTheme.card

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(line.tag).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                if let text = line.text {
                    Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let quote = line.quote {
                    Text("\u{201C}\(Redaction.withoutAddressedNames(quote))\u{201D}")
                        .font(.subheadline)
                        .foregroundStyle(line.text == nil ? AppTheme.textPrimary : AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if let t = line.timestampSec {
                Text(mmss(t)).font(.caption.monospacedDigit()).foregroundStyle(AppTheme.textSecondary)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(fill, in: RoundedRectangle(cornerRadius: 12))
    }
}

/// One category in a picker: its moments, and anything said before them.
struct PickOption {
    let key: String
    let label: String
    let desc: String
    let items: [EvidenceLine]
    var finding: String? = nil
    var chips: [(String, Int)] = []
    var note: String? = nil
    /// A note that needs more than a line of text, shown where `note` is.
    var noteView: AnyView? = nil
    /// Shown even with no items, when "nothing found" is itself the answer.
    var alwaysShow = false
}

/// A row of pills, one per category, and the chosen category's moments below
/// — mirrors `CategoryPicker`.
struct CategoryPickerView: View {
    let options: [PickOption]
    var hint: String? = nil
    @State private var selected: String?

    var body: some View {
        let shown = options.filter { !$0.items.isEmpty || $0.alwaysShow }
        if let current = shown.first(where: { $0.key == selected }) ?? shown.first {
            VStack(alignment: .leading, spacing: 12) {
                FlowLayout(spacing: 8) {
                    ForEach(shown, id: \.key) { o in
                        pill(o, on: o.key == current.key)
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(current.label) \u{00B7} \(current.items.count)").font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                        Spacer()
                        if let hint { Text(hint).font(.caption2).foregroundStyle(AppTheme.textSecondary) }
                    }
                    if let finding = current.finding {
                        Text(finding).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(current.desc).font(.caption).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if !current.chips.isEmpty {
                        FlowLayout(spacing: 6) {
                            ForEach(current.chips, id: \.0) { chip in
                                (Text("\(chip.0) ") + Text("\(chip.1)").bold())
                                    .font(.caption).foregroundStyle(AppTheme.textPrimary)
                                    .padding(.horizontal, 10).padding(.vertical, 4)
                                    .background(AppTheme.card, in: Capsule())
                            }
                        }
                    }
                    if let note = current.note {
                        Text(note).font(.caption).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let noteView = current.noteView { noteView }
                    ForEach(current.items) { EvidenceRow(line: $0) }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }

    private func pill(_ o: PickOption, on: Bool) -> some View {
        Button { selected = o.key } label: {
            HStack(spacing: 6) {
                Text(o.label)
                Text("\(o.items.count)").font(.caption2.weight(.bold))
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(on ? Color.white.opacity(0.2) : AppTheme.cream, in: Capsule())
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(on ? AppTheme.cream : AppTheme.textPrimary)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(on ? AppTheme.forest : AppTheme.card, in: Capsule())
            .overlay(Capsule().strokeBorder(on ? Color.clear : AppTheme.hairline, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }
}

/// An optional block, closed until asked for — the web's <details>.
struct OptionalBlock<Content: View>: View {
    let title: String
    let summary: String
    @ViewBuilder let content: Content
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation { open.toggle() } } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                        Text(summary).font(.caption).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 6)
                    Text("OPTIONAL").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                    Image(systemName: "chevron.down").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .multilineTextAlignment(.leading)
                .padding(14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                VStack(alignment: .leading, spacing: 8) { content }
                    .padding([.horizontal, .bottom], 14)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline, lineWidth: 1.5))
    }
}

/// The shapes "How you brought students in" and the flow strip share.
enum MoveShape: String, CaseIterable {
    case invite, probe, voices, check

    var color: Color {
        switch self {
        case .invite: return Color(hex: 0xB8674A)
        case .probe: return Color(hex: 0x3F7D58)
        case .voices: return Color(hex: 0xB88A1F)
        case .check: return AppTheme.forest
        }
    }

    var soft: Color {
        switch self {
        case .invite: return Color(hex: 0xF7E6DE)
        case .probe: return Color(hex: 0xE3EFE6)
        case .voices: return Color(hex: 0xF7EED6)
        case .check: return AppTheme.mintTint
        }
    }

    var markLabel: String {
        switch self {
        case .invite: return "Invitations to participate"
        case .probe: return "Follow-ups that pushed students further"
        case .voices: return "Reaching beyond volunteers"
        case .check: return "Check for understanding"
        }
    }

    @ViewBuilder func view(size: CGFloat) -> some View {
        switch self {
        case .invite: Triangle().fill(color).frame(width: size, height: size)
        case .probe: Circle().fill(color).frame(width: size, height: size)
        case .voices: Rectangle().fill(color).frame(width: size * 0.72, height: size * 0.72).rotationEffect(.degrees(45))
            .frame(width: size, height: size)
        case .check: Circle().strokeBorder(color, lineWidth: 2).frame(width: size, height: size)
        }
    }
}

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.midX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            p.closeSubpath()
        }
    }
}

private let inviteFormatLabel = ["hands": "Hands up", "call_out": "Call out", "turn_and_talk": "Turn and talk", "write_first": "Write first",
                                 "show_me": "Everyone shows", "choral": "All together", "open": "Opened the floor"]
private let extendKindLabel = ["probe": "Probing", "reasoning": "Asking for reasoning", "build_on_peer": "Building on a classmate"]

/// Your three ways of bringing students in, from the participation read —
/// lessons read before it fall back to the older invitation and
/// revision-prompt reads.
struct ParticipationMoves {
    let invitations: [EvidenceLine]
    let followUps: [EvidenceLine]
    let widening: [EvidenceLine]

    init(_ session: AudioSessionWithSegments) {
        let moves = session.teachingMoves
        let p = moves?.participation
        invitations = (p?.invitations ?? moves?.invitations ?? []).map {
            EvidenceLine(tag: $0.format.flatMap { inviteFormatLabel[$0] } ?? "Opened the floor", quote: $0.quote, timestampSec: $0.timestampSec)
        }
        followUps = (p?.extending ?? moves?.revisionPrompts ?? []).map {
            EvidenceLine(tag: $0.kind.flatMap { extendKindLabel[$0] } ?? "Follow-up", quote: $0.quote, timestampSec: $0.timestampSec)
        }
        widening = (p?.widening ?? []).map { EvidenceLine(tag: "Beyond volunteers", quote: $0.quote, timestampSec: $0.timestampSec) }
    }

    /// A follow-up first (building on a classmate, then reasoning, then a
    /// plain probe), then reaching beyond volunteers, then an invitation.
    var keep: KeepLine? {
        func line(_ e: EvidenceLine?, _ text: String) -> KeepLine? {
            guard let e, let q = e.quote, let t = e.timestampSec else { return nil }
            return KeepLine(text: text, quote: q, timestampSec: t)
        }
        return line(followUps.first { $0.tag == "Building on a classmate" }, "You asked students to build on each other\u{2019}s ideas.")
            ?? line(followUps.first { $0.tag == "Asking for reasoning" }, "You asked a student for their reasoning, not just the answer.")
            ?? line(followUps.first, "You asked a student to say more.")
            ?? line(widening.first, "You reached past the usual volunteers.")
            ?? line(invitations.first, "You opened the floor to the room.")
    }
}

// MARK: - 1. Talk & Participation

struct TalkSection: View {
    let session: AudioSessionWithSegments
    let note: String?
    let hardLook: AnyView?
    let onDiscuss: () -> Void

    private var wpm: Double? { session.metricsDetail?["teacherWordsPerMinute"] }

    var body: some View {
        let moves = ParticipationMoves(session)
        let silenceNote = AudioInsights.leadingSilenceNote(firstWordSec: session.metricsDetail?["firstWordSec"])
        let hasEnvelope = session.metricsDetail?["quietSec"] != nil
        var read = [
            "Talk time describes the recording, not the room: it doesn\u{2019}t show how many students took part or whether they were engaged, and a microphone near you hears you far better than it hears them.",
            "\u{201C}Sound, no words\u{201D} and \u{201C}Quiet\u{201D} are everything that was neither clearly you nor clearly a student"
                + (hasEnvelope ? ". In a classroom, sound with no words is usually voices the microphone could not make out; a video or noise from outside reads the same way."
                    : ": quiet work, several voices at once, and audio too faint to place."),
        ]
        if let silenceNote { read.append(silenceNote) }
        if wpm != nil {
            read.append("Pace is words a minute of your own speaking time, short pauses included. Everyday conversation usually runs about \(AudioInsights.conversationalWpmRange) \u{2014} a range to place yourself against, not a target.")
        }
        return SectionCard(
            section: .talk, note: note, keep: moves.keep, tryNext: session.nextSteps?.talk,
            howToRead: read, hardLook: hardLook, onDiscuss: onDiscuss
        ) {
            talkNumbers
            // Your moves are drawn once, on "When it happened" below.
            FlowStrip(session: session, marks: [])
            BroughtStudentsInView(session: session, moves: moves)
            if let stretch = TeacherStretch.longest(in: session.segments), stretch.durationSec >= TeacherStretch.minToShowSec {
                LongestStretchView(stretch: stretch, read: session.teachingMoves?.stretch, segments: session.segments)
            }
        }
    }

    private func marks(_ moves: ParticipationMoves) -> [(Double, MoveShape)] {
        moves.invitations.compactMap { $0.timestampSec.map { ($0, .invite) } }
            + moves.followUps.compactMap { $0.timestampSec.map { ($0, .probe) } }
            + moves.widening.compactMap { $0.timestampSec.map { ($0, .voices) } }
            + (session.cfuLog ?? []).map { ($0.timestampSec, .check) }
    }

    private var talkNumbers: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                tile("You", session.teacherTalkPct.map { "\(Int($0.rounded()))%" } ?? "\u{2014}",
                     session.teacherTalkPct != nil ? "of the recording" : "unavailable", FlowStrip.you)
                tile("Students", session.studentTalkPct.map { "\(Int($0.rounded()))%" } ?? "\u{2014}",
                     session.studentTalkPct != nil ? "that came through as words" : "unavailable", FlowStrip.students)
            }
            tile("Your pace", wpm.map { "\(Int($0.rounded()))" } ?? "\u{2014}",
                 wpm != nil ? "words a minute \u{00B7} conversation usually runs \(AudioInsights.conversationalWpmRange)" : "unavailable", nil)
        }
    }

    private func tile(_ label: String, _ value: String, _ sub: String, _ color: Color?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            Text(value).font(.heading(.title2)).foregroundStyle(color ?? AppTheme.textPrimary)
            Text(sub).font(.caption2).foregroundStyle(AppTheme.textSecondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
    }
}

/// The recording minute by minute: the share bar the tiles state, then one
/// block per slice coloured by what most of it was, with your moves marked
/// above — mirrors TalkFlowStrip.tsx.
struct FlowStrip: View {
    let session: AudioSessionWithSegments
    let marks: [(Double, MoveShape)]

    static let you = Color(hex: 0x2F855A)
    static let students = Color(hex: 0x8B7BC2)
    static let sound = Color(hex: 0xD08A2A)
    static let quiet = Color(hex: 0x3F8FD8)

    private enum Bin { case you, students, sound, quiet, unknown }
    private static let bins = 30

    var body: some View {
        if let duration = session.durationSec, duration > 0, !session.segments.isEmpty {
            let binSec = duration / Double(Self.bins)
            let flow = (0..<Self.bins).map { bin(Double($0) * binSec, Double($0 + 1) * binSec) }
            let slices = shares.filter { $0.pct >= 0.5 }
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Your recording, minute by minute")
                    Spacer()
                    Text(mmss(duration))
                }
                .font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                GeometryReader { geo in
                    HStack(spacing: 2) {
                        ForEach(slices, id: \.label) { s in
                            sliceFill(s.color)
                                .frame(width: max(2, (geo.size.width - CGFloat(slices.count - 1) * 2) * CGFloat(s.pct / 100)))
                        }
                    }
                }
                .frame(height: 14)
                .clipShape(Capsule())
                FlowLayout(spacing: 12) {
                    ForEach(slices, id: \.label) { s in
                        HStack(spacing: 5) {
                            sliceFill(s.color).frame(width: 10, height: 10).clipShape(Circle())
                            (Text("\(s.label) ") + Text("\(Int(s.pct.rounded()))%").bold())
                        }
                        .font(.caption).foregroundStyle(AppTheme.textPrimary)
                    }
                }
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        ForEach(Array(marks.enumerated()), id: \.offset) { _, m in
                            m.1.view(size: 9)
                                .position(x: min(geo.size.width - 5, max(5, geo.size.width * CGFloat(m.0 / duration))), y: 5)
                        }
                        HStack(spacing: 1) {
                            ForEach(Array(flow.enumerated()), id: \.offset) { _, b in binFill(b) }
                        }
                        .frame(height: 28)
                        .offset(y: 14)
                    }
                }
                .frame(height: 42)
                HStack {
                    Text("0:00")
                    Spacer()
                    Text(mmss(duration))
                }
                .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                let kinds = MoveShape.allCases.filter { k in marks.contains { $0.1 == k } }
                if !kinds.isEmpty {
                    FlowLayout(spacing: 10) {
                        ForEach(kinds, id: \.self) { k in
                            HStack(spacing: 5) {
                                k.view(size: 10)
                                Text(k.markLabel)
                            }
                            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                }
                Text((session.soundTimeline != nil ? "\u{201C}Sound, no words\u{201D} is sound the microphone caught but couldn\u{2019}t turn into words. " : "")
                     + "\u{201C}Students\u{201D} is speech the transcript didn\u{2019}t attribute to you \u{2014} a student close to you can be heard as you, and you as them.")
                    .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 18))
        } else {
            Text("Talk flow unavailable this session.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                .frame(maxWidth: .infinity).frame(height: 28)
                .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private struct Share { let label: String; let pct: Double; let color: Color? }

    /// Mirrors `recordingShares`: you and students as the tiles state them,
    /// the rest split into sound-with-no-words and quiet where the envelope
    /// measured them, else one "no reading" slice.
    private var shares: [Share] {
        guard let teacher = session.teacherTalkPct else { return [] }
        let students = session.studentTalkPct ?? 0
        let rest = max(0, 100 - teacher - students)
        var out = [Share(label: "You", pct: teacher, color: Self.you), Share(label: "Students", pct: students, color: Self.students)]
        if let q = session.metricsDetail?["quietSec"], let u = session.metricsDetail?["unresolvedSec"], q + u > 0 {
            out.append(Share(label: "Sound, no words", pct: rest * u / (q + u), color: Self.sound))
            out.append(Share(label: "Quiet", pct: rest * q / (q + u), color: Self.quiet))
        } else {
            out.append(Share(label: "No reading", pct: rest, color: nil))
        }
        return out
    }

    @ViewBuilder private func sliceFill(_ color: Color?) -> some View {
        if let color { Rectangle().fill(color) } else { Rectangle().fill(AppTheme.hairline.opacity(0.5)).overlay(HatchFill().clipped()) }
    }

    @ViewBuilder private func binFill(_ b: Bin) -> some View {
        switch b {
        case .you: Rectangle().fill(Self.you)
        case .students: Rectangle().fill(Self.students)
        case .sound: Rectangle().fill(Self.sound)
        case .quiet: Rectangle().fill(Self.quiet)
        case .unknown: Rectangle().fill(AppTheme.hairline.opacity(0.5)).overlay(HatchFill().clipped())
        }
    }

    private func bin(_ start: Double, _ end: Double) -> Bin {
        var you = 0.0, students = 0.0
        for s in session.segments where s.startSec < end && s.endSec > start && !s.text.trimmingCharacters(in: .whitespaces).isEmpty {
            let overlap = min(s.endSec, end) - max(s.startSec, start)
            if s.speakerLabel == "Teacher" { you += overlap } else { students += overlap }
        }
        let spoken = you + students
        var sound = 0.0, quiet = 0.0
        if let chars = session.soundTimeline.map({ Array($0.seconds) }) {
            var sec = Int(start)
            while sec < Int(end.rounded(.up)) && sec < chars.count {
                if chars[sec] == "s" { sound += 1 } else if chars[sec] == "q" { quiet += 1 }
                sec += 1
            }
        }
        let best = max(spoken, sound, quiet)
        if best <= 0 { return .unknown }
        if best == spoken { return you >= students ? .you : .students }
        return best == sound ? .sound : .quiet
    }
}

/// Diagonal stripes for "no reading".
struct HatchFill: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += 5
            }
            context.stroke(path, with: .color(AppTheme.textSecondary.opacity(0.45)), lineWidth: 1)
        }
    }
}

/// How you brought students in: the three moves as filters, and every moment
/// — mirrors BroughtStudentsIn.tsx. Where they fell is the flow strip above.
struct BroughtStudentsInView: View {
    let session: AudioSessionWithSegments
    let moves: ParticipationMoves

    @State private var filter: MoveShape?
    @State private var expanded = false

    private static let studentColor = Color(hex: 0x8B7FC0)
    private static let listLimit = 4

    private struct Moment: Identifiable {
        let id: Int
        let t: Double
        let type: MoveShape
        let line: EvidenceLine
    }

    private var moments: [Moment] {
        let all = moves.invitations.map { ($0, MoveShape.invite) } + moves.followUps.map { ($0, .probe) } + moves.widening.map { ($0, .voices) }
        return all.compactMap { line, type in line.timestampSec.map { (line, type, $0) } }
            .sorted { $0.2 < $1.2 }
            .enumerated()
            .map { Moment(id: $0.offset, t: $0.element.2, type: $0.element.1, line: $0.element.0) }
    }

    private static func name(_ k: MoveShape) -> String {
        switch k {
        case .invite: return "Invited the room in"
        case .probe: return "Asked students to say more"
        default: return "Reached beyond volunteers"
        }
    }

    private static func desc(_ k: MoveShape) -> String {
        switch k {
        case .invite: return "Asking students to share, read, or answer."
        case .probe: return "Follow-ups that pushed for reasons or detail."
        default: return "Brought in students who hadn\u{2019}t raised a hand."
        }
    }

    var body: some View {
        let all = moments
        let answers = session.answerLog ?? []
        let heard = session.metricsDetail?["answersHeardCount"].map { Int($0) }
        let followed = session.metricsDetail?["answersFollowedUpCount"].map { Int($0) }
        let showRate = (heard ?? 0) >= 3 && followed != nil
        if !all.isEmpty || showRate {
            let duration = session.durationSec ?? max(60, all.map(\.t).max() ?? 60)
            let firstHalf = all.filter { $0.t < duration / 2 }.count
            let types: [MoveShape] = [.invite, .probe] + (all.contains { $0.type == .voices } ? [.voices] : [])
            VStack(alignment: .leading, spacing: 12) {
                PartHeading(title: "How you brought students in")
                if !all.isEmpty {
                    (Text("\(all.count) move\(all.count == 1 ? "" : "s") to bring students in \u{2014} ")
                        + Text("\(firstHalf) of \(all.count)").foregroundColor(AppTheme.terracotta600)
                        + Text(" came in the first half."))
                        .font(.heading(.headline)).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !all.isEmpty { timeline(all, duration: duration, types: types) }
                ForEach(types, id: \.self) { k in
                    moveCard(k, count: all.filter { $0.type == k }.count, answers: answers, heard: heard, followed: followed, showRate: showRate)
                }
                if !all.isEmpty { momentList(all) }
            }
        }
    }

    /// Checks for understanding, drawn on the timeline only — Questioning &
    /// Checking lists them.
    private var checks: [Double] {
        (session.cfuLog ?? []).filter { $0.loop?.who != "not_a_check" }.map(\.timestampSec)
    }

    /// Your moves across the lesson. The answers the recording heard are the
    /// dots on the follow-up card, not a second row here.
    private func timeline(_ all: [Moment], duration: Double, types: [MoveShape]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("When it happened")
                Spacer()
                Text(mmss(duration))
            }
            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            HStack(spacing: 8) {
                Text("You").font(.caption2.weight(.semibold)).foregroundStyle(AppTheme.textSecondary).frame(width: 40, alignment: .leading)
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        Path { p in p.move(to: CGPoint(x: 0, y: 16)); p.addLine(to: CGPoint(x: geo.size.width, y: 16)) }
                            .stroke(AppTheme.hairline, lineWidth: 2)
                        ForEach(all) { m in
                            m.type.view(size: 14)
                                .opacity(filter == nil || filter == m.type ? 1 : 0.18)
                                .position(x: min(geo.size.width - 7, max(7, geo.size.width * CGFloat(m.t / duration))), y: 16)
                        }
                        ForEach(Array(checks.enumerated()), id: \.offset) { _, t in
                            MoveShape.check.view(size: 14)
                                .opacity(filter == nil ? 1 : 0.18)
                                .position(x: min(geo.size.width - 7, max(7, geo.size.width * CGFloat(t / duration))), y: 16)
                        }
                    }
                }
                .frame(height: 32)
            }
            Divider().padding(.top, 4)
            FlowLayout(spacing: 10) {
                ForEach(types + (checks.isEmpty ? [] : [.check]), id: \.self) { k in
                    HStack(spacing: 4) { k.view(size: 10); Text(k.markLabel) }
                }
            }
            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
        }
        .padding(14)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    private func moveCard(_ k: MoveShape, count: Int, answers: [AudioAnswer], heard: Int?, followed: Int?, showRate: Bool) -> some View {
        let on = filter == k
        return Button {
            filter = on ? nil : k
            expanded = false
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    k.view(size: 13).frame(width: 30, height: 30).background(k.soft, in: RoundedRectangle(cornerRadius: 8))
                    Spacer()
                    Text("\(count)").font(.heading(.title)).foregroundStyle(k.color)
                }
                Text(Self.name(k)).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                Text(Self.desc(k)).font(.caption).foregroundStyle(AppTheme.textSecondary)
                if k == .probe, showRate, let heard, let followed {
                    if !answers.isEmpty {
                        FlowLayout(spacing: 4) {
                            ForEach(Array(answers.enumerated()), id: \.offset) { _, a in
                                Circle().fill(a.followed ? k.color : .clear).overlay(Circle().strokeBorder(k.color, lineWidth: 2)).frame(width: 12, height: 12)
                            }
                        }
                        .padding(.top, 2)
                    }
                    (Text("Followed up on ") + Text("\(followed) of \(heard)").bold().foregroundColor(AppTheme.textPrimary)
                        + Text(" student answers the recording could hear"))
                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .multilineTextAlignment(.leading)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(on ? k.color : AppTheme.hairline, lineWidth: on ? 2 : 1))
        }
        .buttonStyle(.plain)
    }

    private func momentList(_ all: [Moment]) -> some View {
        let matching = all.filter { filter == nil || $0.type == filter }
        let shown = filter != nil || expanded ? matching : Array(matching.prefix(Self.listLimit))
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(filter.map { "\(Self.name($0)) \u{00B7} \(matching.count)" } ?? "Every moment, in order")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                Spacer()
                if filter != nil {
                    Button("Show all") { filter = nil }.font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { idx, m in
                    if idx > 0 { Divider() }
                    HStack(alignment: .top, spacing: 10) {
                        Text(mmss(m.t)).font(.caption.monospacedDigit().weight(.semibold)).foregroundStyle(AppTheme.textSecondary).frame(width: 40, alignment: .leading)
                        m.type.view(size: 12).padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.line.tag.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                            Text("\u{201C}\(Redaction.withoutAddressedNames(m.line.quote ?? ""))\u{201D}").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                }
                if filter == nil && matching.count > Self.listLimit {
                    Divider()
                    Button(expanded ? "Show fewer" : "Show all \(matching.count)") { expanded.toggle() }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                        .frame(maxWidth: .infinity).padding(12)
                }
            }
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
        }
    }
}

/// Your longest unbroken stretch of talk: how long, what it was doing, its
/// words behind "Show transcript", and a place to break it only where the
/// stretch read found one — mirrors LongestStretchCard.
struct LongestStretchView: View {
    let stretch: TeacherStretch
    let read: AudioTeachingMoves.Stretch?
    let segments: [TranscriptSegment]
    @State private var open = false

    private static let breakMove = ["check": "a quick check would fit there", "pause": "a pause would let it land",
                                    "question": "a question to the room would fit there"]

    var body: some View {
        let matched = read.flatMap { abs($0.startSec - stretch.startSec) < 1 ? $0 : nil }
        let lines = segments.filter {
            $0.speakerLabel == "Teacher" && !$0.text.trimmingCharacters(in: .whitespaces).isEmpty
                && $0.startSec >= stretch.startSec - 0.01 && $0.endSec <= stretch.endSec + 0.01
        }
        let opening = (lines.first { $0.text.split(whereSeparator: \.isWhitespace).count >= 6 } ?? lines.first)?
            .text.trimmingCharacters(in: .whitespaces) ?? stretch.opening
        VStack(alignment: .leading, spacing: 8) {
            PartHeading(title: "Your longest explanation", count: "about \(max(1, Int((stretch.durationSec / 60).rounded()))) min")
            if let about = matched?.about, !about.isEmpty {
                Text(about.prefix(1).uppercased() + about.dropFirst()).font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("FROM THE STRETCH")
                    Spacer()
                    Text("\(mmss(stretch.startSec))\u{2013}\(mmss(stretch.endSec))")
                }
                .font(.caption2.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                Text("\u{201C}\(Redaction.withoutAddressedNames(opening))\u{201D}").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if open {
                    Divider()
                    ForEach(lines.filter { $0.text.trimmingCharacters(in: .whitespaces) != opening }) { l in
                        (Text(mmss(l.startSec) + "  ").font(.caption.monospacedDigit()) + Text(Redaction.withoutAddressedNames(l.text.trimmingCharacters(in: .whitespaces))))
                            .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.cream)
            .overlay(alignment: .leading) { Rectangle().fill(AppTheme.terracotta).frame(width: 4) }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            if lines.count > 1 {
                Button(open ? "Hide transcript" : "Show transcript") { withAnimation { open.toggle() } }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
            }
            if let brk = matched?.breakAfter {
                (Text("A place to break it up: ").bold()
                    + Text("after \u{201C}\(brk.quote)\u{201D} (\(mmss(brk.atSec))) \u{2014} \(brk.closes) is complete there, and \(Self.breakMove[brk.move] ?? "a pause would let it land")."))
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(10)
                    .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 12))
            }
            Text("A stretch ends when a student is heard or you pause for more than ten seconds. A student the microphone missed does not end it.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - 2. Questioning & Checking

struct QuestionsSection: View {
    let session: AudioSessionWithSegments
    let note: String?
    let hardLook: AnyView?
    let onDiscuss: () -> Void

    /// What the list shows: a question kind, answered yourself, follow-ups,
    /// or checks — mirrors `QPick` in AudioCoaching.tsx.
    enum QPick: Hashable { case mix(QuestionMix), selfAnswered, followUp, checks }

    @State private var pick: QPick?
    /// The mark last tapped on the timeline. Ids say what a mark is:
    /// questions from 0, checks from 1000, answered yourself from 2000,
    /// follow-ups from 3000.
    @State private var hot: Int?
    @State private var showAlsoHeard = false

    private static let mixLabel: [QuestionMix: String] = [
        .recall: "Recall", .understand: "Understand", .apply: "Apply", .higherOrder: "Higher-order",
    ]
    private static let mixDesc: [QuestionMix: String] = [
        .recall: "Retrieved from memory \u{2014} a fact, name or step they already had.",
        .understand: "Put meaning into their own words \u{2014} explain, summarise, interpret.",
        .apply: "Used what they had learned on a new case.",
        .higherOrder: "Analysed, judged with evidence, or made something new.",
    ]
    /// Two kinds beside the three a question can ask for, in their own colours.
    private static let selfColor = Color(hex: 0xC96A45)
    private static let followColor = Color(hex: 0xE2BC5C)
    private static let selfLabel = "Answered yourself"
    private static let followLabel = "Follow-up"
    private static let selfDesc = "You asked, and gave the answer before a student could."
    private static let followDesc = "Right after a student answered, you pushed on what they said."

    var body: some View {
        let questions = QuestionMix.classify(session)
        let count = { (k: QuestionMix) in questions.filter { $0.mix == k }.count }
        let heard = session.metricsDetail?["answersHeardCount"].map { Int($0) }
        let followed = session.metricsDetail?["answersFollowedUpCount"].map { Int($0) }
        let showRate = (heard ?? 0) >= 3 && followed != nil
        let first = questions.first { $0.mix == .higherOrder } ?? questions.first { $0.mix == .understand }
        let keep = first.map {
            KeepLine(text: count(.higherOrder) > 0
                     ? "Your \u{201C}why\u{201D} questions. \(count(.higherOrder)) asked students to analyse, judge with evidence, or make something new."
                     : "\(count(.understand)) of your questions asked students to put an idea in their own words.",
                     quote: $0.entry.text, timestampSec: $0.entry.timestampSec)
        }
        // The follow-up rate lives only in this goal; the follow-ups
        // themselves are a kind on the questions timeline.
        let goal = showRate && followed! < heard! ? "Goal: \(min(heard!, followed! + 2)) of \(heard!) answers followed up, up from \(followed!)." : nil
        return SectionCard(
            section: .questions, note: note, keep: keep, tryNext: session.nextSteps?.questions, tryGoal: goal,
            howToRead: [
                "Questions are the ones you asked and left with students \u{2014} not \u{201C}okay?\u{201D}, \u{201C}right?\u{201D} or \u{201C}are we ready?\u{201D}. Each is sorted by what answering it asked for: recall, explaining why or how, or reasoning (justifying, comparing, judging). A question you answered yourself before a student could, and a follow-up straight after a student answer, each have their own colour on the timeline. Tags like \u{201C}right?\u{201D} and housekeeping questions are listed but not counted.",
                "A check is a moment you asked students to show or say what they understood. Each says who it asked and what you did next \u{2014} from your own words, so a check you acted on silently (scanning boards, changing course without saying so) shows as nothing heard. It never says whether students understood.",
                "A follow-up can only be spotted after a student answer the recording heard, so the dots count those answers only.",
            ],
            hardLook: hardLook, onDiscuss: onDiscuss
        ) {
            questionsChecksPart()
            alsoHeardPart()
        }
    }

    // MARK: Your questions and checks

    /// Your questions and checks on one lesson timeline: each question a dot
    /// in its kind's colour — recall, explain, reasoning, answered yourself,
    /// follow-up — and each check a ring (dashed when it only asked whether
    /// students understood). A question you answered yourself is shown as
    /// that and only that. The pills choose what the list shows; a dot shows
    /// its own. Never a claim that students understood.
    private typealias QItem = ThinkingPause.Question

    /// One moment in the list: the mark's id, when, the words, and for a
    /// check what it asked and what you did next.
    private struct Moment {
        let id: Int
        let t: Double
        let quote: String
        var tag: String? = nil
        var then: String? = nil
    }

    /// Terracotta, so a check can never be read as a question.
    private static let checkColor = Color(hex: 0xB4593A)
    private static let checkWho = ["everyone": "Asked everyone", "few": "A few answered", "asked_if_understood": "Asked if they understood"]
    private static let checkActed = ["adjusted": "You went back over it", "confirmed": "You confirmed and moved on"]

    private var qcChecks: [AudioCfuEntry] { (session.cfuLog ?? []).filter { $0.loop?.who != "not_a_check" } }

    /// The follow-ups the answer log paired with a student answer — the same
    /// ones the follow-up count rests on.
    private var followUps: [AudioFollowUpLine] { session.followUpLog ?? [] }

    @ViewBuilder
    private func questionsChecksPart() -> some View {
        let tawt = ThinkingPause.detail(session)
        let questions = tawt.questions
        let selfAnswered = tawt.selfAnswered
        let checks = qcChecks
        let count = { (k: QuestionMix) in questions.filter { $0.mix == k }.count }
        let current: QPick = pick ?? (count(.higherOrder) > 0 ? .mix(.higherOrder) : count(.understand) > 0 ? .mix(.understand)
            : !questions.isEmpty ? .mix(.recall) : !selfAnswered.isEmpty ? .selfAnswered : .checks)
        VStack(alignment: .leading, spacing: 12) {
            PartHeading(title: "Your questions and checks",
                        count: "\(questions.count) question\(questions.count == 1 ? "" : "s") \u{00B7} \(checks.count) check\(checks.count == 1 ? "" : "s")")
            if questions.isEmpty && checks.isEmpty && selfAnswered.isEmpty && followUps.isEmpty {
                Text("No questions or checks for understanding were heard in this lesson.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                Text(qcFinding(questions, selfAnswered.count, checks, count: count))
                    .font(.body.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                qcTimeline(questions, selfAnswered, checks)
                qcPills(questions, selfAnswered.count, checks.count, current: current, count: count)
                if let caveat = qcMixCaveat {
                    Text(caveat).font(.caption).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                qcList(current, questions, selfAnswered, checks)
                if let average = tawt.average { tawtCard(tawt, average: average) }
            }
        }
    }

    private func qcFinding(_ questions: [QItem], _ selfCount: Int, _ checks: [AudioCfuEntry], count: (QuestionMix) -> Int) -> String {
        let beyond = count(.understand) + count(.apply) + count(.higherOrder)
        let everyone = checks.filter { $0.loop?.who == "everyone" }.count
        var q: String
        if questions.isEmpty { q = "No questions were left with students. " }
        else if beyond == 0 { q = "All \(questions.count) questions asked students to recall something. " }
        else { q = "\(beyond) of \(questions.count) were higher-order questions (explain or reasoning). " }
        if selfCount > 0 { q += (selfCount == 1 ? "Once" : "\(selfCount) times") + " you answered your own question. " }
        if checks.isEmpty { return q + "No checks for understanding were heard." }
        var c = "You checked for understanding \(checks.count) time\(checks.count == 1 ? "" : "s")"
        if everyone > 0 { c += ", " + (everyone == checks.count ? "each" : "\(everyone) of them") + " asking everyone" }
        return q + c + "."
    }

    private func kindOf(_ id: Int, _ questions: [QItem]) -> QPick {
        id >= 3000 ? .followUp : id >= 2000 ? .selfAnswered : id >= 1000 ? .checks : .mix(questions[id].mix)
    }

    private func qcTimeline(_ questions: [QItem], _ selfAnswered: [AudioTeachingMoves.Quoted], _ checks: [AudioCfuEntry]) -> some View {
        let times = questions.map { $0.entry.timestampSec } + checks.map(\.timestampSec) + selfAnswered.map(\.timestampSec) + followUps.map(\.timestampSec)
        let duration = session.durationSec ?? max(60, times.max() ?? 60)
        let marks: [(id: Int, t: Double, color: Color)] =
            questions.enumerated().map { ($0.offset, $0.element.entry.timestampSec, $0.element.mix.color) }
            + selfAnswered.enumerated().map { (2000 + $0.offset, $0.element.timestampSec, Self.selfColor) }
            + followUps.enumerated().map { (3000 + $0.offset, $0.element.timestampSec, Self.followColor) }
        return VStack(spacing: 4) {
            qcLane("Questions") { width in
                ForEach(marks, id: \.id) { m in
                    self.markButton(m.id, questions) {
                        // A white edge keeps dots that fall close together readable.
                        Circle().fill(m.color).frame(width: 13, height: 13)
                            .overlay(Circle().stroke(AppTheme.card, lineWidth: 2))
                    }
                    .position(x: self.qx(m.t, duration, width), y: 14)
                }
            }
            qcLane("Checks") { width in
                ForEach(Array(checks.enumerated()), id: \.offset) { i, c in
                    let dash: [CGFloat] = c.loop?.who == "asked_if_understood" ? [3, 2] : []
                    self.markButton(1000 + i, questions) {
                        Circle().fill(AppTheme.card)
                            .overlay(Circle().strokeBorder(Self.checkColor, style: StrokeStyle(lineWidth: 2.5, dash: dash)))
                            .frame(width: 13, height: 13)
                            .overlay(Circle().stroke(AppTheme.card, lineWidth: 2).padding(-1))
                    }
                    .position(x: self.qx(c.timestampSec, duration, width), y: 14)
                }
            }
            HStack {
                Text("0:00")
                Spacer()
                Text(mmss(duration))
            }
            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
            .padding(.leading, 70)
        }
        .padding(12)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.hairline))
    }

    /// A mark on the timeline: tapping it shows its kind with it picked out.
    /// Every mark in full colour and size; only the one tapped grows.
    private func markButton<L: View>(_ id: Int, _ questions: [QItem], @ViewBuilder label: () -> L) -> some View {
        Button {
            pick = kindOf(id, questions)
            hot = id
        } label: {
            label().scaleEffect(hot == id ? 1.5 : 1)
        }
        .buttonStyle(.plain)
    }

    private func qcPills(_ questions: [QItem], _ selfCount: Int, _ checks: Int, current: QPick, count: @escaping (QuestionMix) -> Int) -> some View {
        let dot = { (c: Color) in AnyView(Circle().fill(c).frame(width: 11, height: 11)) }
        let checksOn = current == .checks
        var pills: [(key: QPick, label: String, n: Int, swatch: AnyView)] = QuestionMix.allCases.map {
            (.mix($0), Self.mixLabel[$0]!, count($0), dot($0.color))
        }
        pills.append((.selfAnswered, Self.selfLabel, selfCount, dot(Self.selfColor)))
        pills.append((.followUp, Self.followLabel, followUps.count, dot(Self.followColor)))
        pills.append((.checks, "Checks for understanding", checks,
                      AnyView(Circle().strokeBorder(checksOn ? AppTheme.cream : Self.checkColor, lineWidth: 2).frame(width: 11, height: 11))))
        return FlowLayout(spacing: 8) {
            ForEach(pills.filter { $0.n > 0 }, id: \.key) { p in
                qcPill(p.label, p.n, on: current == p.key, swatch: p.swatch) {
                    pick = p.key
                    hot = nil
                }
            }
        }
    }

    /// Below this the report is reading a minority of the room. The same bar
    /// the server uses before it will say a thing was absent, and the web's
    /// LOW_CAPTURE_PCT.
    private static let lowCapturePct = 50

    /// An empty level is hidden rather than shown as a zero, which is right \u{2014}
    /// but hiding still makes a claim, because what is left reads as the whole
    /// shape of a teacher's questioning. Two cases have to say otherwise.
    private var qcMixCaveat: String? {
        let levelsRead = !(session.teachingMoves?.questionKinds ?? []).isEmpty
        if !levelsRead {
            return "The levels were not read for this lesson, so these come from a coarser split that can only tell recall from the rest \u{2014} Apply and Higher-order could not appear either way."
        }
        let detail = session.metricsDetail ?? [:]
        let captured = (detail["teacherTalkSec"] ?? 0) + (detail["studentTalkSec"] ?? 0)
        guard let duration = session.durationSec, duration > 0, captured > 0 else {
            return "How much of this room came through as speech is unknown, so this is the shape of the questions that were heard. A level missing here was not necessarily a level you did not ask."
        }
        let pct = Int((captured / duration * 100).rounded())
        guard pct < Self.lowCapturePct else { return nil }
        return "About \(pct)% of this room came through as speech, so this is the shape of the questions that were heard. A level missing here was not necessarily a level you did not ask."
    }

    private func qcChecksDesc(_ checks: [AudioCfuEntry]) -> String {
        let askedIf = checks.filter { $0.loop?.who == "asked_if_understood" }.count
        let acted = checks.filter { $0.loop?.acted != nil }.count
        var d = "Moments you asked students to show or say what they understood"
        if askedIf > 0 { d += " \u{2014} \(askedIf) only asked whether they understood" }
        d += ". "
        d += acted > 0 ? "You said what you\u{2019}d do with the answers \(acted) time\(acted == 1 ? "" : "s")." : "No response to the answers was heard."
        return d
    }

    private func moments(_ k: QPick, _ questions: [QItem], _ selfAnswered: [AudioTeachingMoves.Quoted], _ checks: [AudioCfuEntry]) -> [Moment] {
        switch k {
        case .checks:
            return checks.enumerated().map { i, c in
                let who = c.loop.flatMap { Self.checkWho[$0.who] } ?? "Check for understanding"
                let did = c.loop?.acted.flatMap { Self.checkActed[$0.how] }
                return Moment(id: 1000 + i, t: c.timestampSec, quote: c.text,
                              tag: [who, did].compactMap { $0 }.joined(separator: " \u{00B7} "), then: c.loop?.acted?.text)
            }
        case .selfAnswered:
            return selfAnswered.enumerated().map { Moment(id: 2000 + $0.offset, t: $0.element.timestampSec, quote: $0.element.quote) }
        case .followUp:
            return followUps.enumerated().map { Moment(id: 3000 + $0.offset, t: $0.element.timestampSec, quote: $0.element.text) }
        case .mix(let m):
            return questions.enumerated().compactMap { i, q in q.mix == m ? Moment(id: i, t: q.entry.timestampSec, quote: q.entry.text) : nil }
        }
    }

    @ViewBuilder
    private func qcList(_ k: QPick, _ questions: [QItem], _ selfAnswered: [AudioTeachingMoves.Quoted], _ checks: [AudioCfuEntry]) -> some View {
        let list = moments(k, questions, selfAnswered, checks)
        let (title, desc, tag): (String, String, String) = {
            switch k {
            case .checks: return ("Checks for understanding \u{00B7} \(checks.count)", qcChecksDesc(checks), "")
            case .selfAnswered: return ("\(Self.selfLabel) \u{00B7} \(list.count)", Self.selfDesc, Self.selfLabel)
            case .followUp: return ("\(Self.followLabel) \u{00B7} \(list.count)", Self.followDesc, Self.followLabel)
            case .mix(let m): return ("\(Self.mixLabel[m]!) \u{00B7} \(list.count) of \(questions.count)", Self.mixDesc[m] ?? "", Self.mixLabel[m]!)
            }
        }()
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                Spacer()
                Text("Tap a dot, or a kind above").font(.caption2).foregroundStyle(AppTheme.textSecondary)
            }
            Text(desc).font(.caption).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(list, id: \.id) { m in
                EvidenceRow(line: m.tag != nil
                            ? EvidenceLine(tag: m.tag!, text: "\u{201C}\(Redaction.withoutAddressedNames(m.quote))\u{201D}", quote: m.then, timestampSec: m.t)
                            : EvidenceLine(tag: tag, quote: m.quote, timestampSec: m.t))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.forest, lineWidth: 2).opacity(hot == m.id ? 1 : 0))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 18))
    }

    /// Teacher-Anchored Wait Time: how long you left a question that asked
    /// students to explain or reason with the class, until you spoke again —
    /// the same number as the Summary tile, with each question behind it.
    private func tawtCard(_ tawt: ThinkingPause.Detail, average: Double) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Teacher-Anchored Wait Time (TAWT)").font(.heading(.headline)).foregroundStyle(AppTheme.forest)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(String(format: "%.1f", average)).font(.heading(.largeTitle)).foregroundStyle(AppTheme.forest)
                Text("s").font(.body.weight(.bold)).foregroundStyle(AppTheme.forest)
                Text("average of \(tawt.measured)").font(.subheadline).foregroundStyle(AppTheme.textSecondary).padding(.leading, 4)
            }
            Text("After each question that asked students to think \u{2014} to explain or to reason \u{2014} the time from the end of your question until you spoke again, with any student answer included. It shows how long you left the thinking with the class before stepping back in. When no one answered, three seconds or more of silence gives most students time to think.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(Array(tawt.thinking.enumerated()), id: \.offset) { i, q in
                let p = tawt.pauses[i]
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 5) {
                            Circle().fill(q.mix.color).frame(width: 9, height: 9)
                            Text(Self.mixLabel[q.mix] ?? "")
                            Text("\u{00B7} \(mmss(q.entry.timestampSec))").font(.caption.monospacedDigit().weight(.regular))
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                        Text("\u{201C}\(Redaction.withoutAddressedNames(q.entry.text))\u{201D}")
                            .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .trailing, spacing: 2) {
                        if let p {
                            Text(String(format: "%.1f s", p.sec)).font(.heading(.subheadline)).foregroundStyle(AppTheme.forest)
                            Text(p.keptTalking ? "you kept talking" : p.answered ? "a student answered" : "no one answered")
                        } else {
                            Text("not measured")
                        }
                    }
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.trailing)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    // MARK: Also heard

    /// Question marks that asked nothing of students. Tags are counted from
    /// the transcript (QuestionTags); housekeeping comes from the moves read,
    /// on lessons read since it existed. Not counted as questions anywhere.
    @ViewBuilder
    private func alsoHeardPart() -> some View {
        let tags = QuestionTags.find(session.segments)
        let housekeeping = session.teachingMoves?.housekeeping ?? []
        if !tags.isEmpty || !housekeeping.isEmpty {
            let summary = [
                tags.isEmpty ? nil : "\(tags.count) \u{201C}right?\u{201D} / \u{201C}okay?\u{201D} tag\(tags.count == 1 ? "" : "s")",
                housekeeping.isEmpty ? nil : "\(housekeeping.count) housekeeping question\(housekeeping.count == 1 ? "" : "s")",
            ].compactMap { $0 }.joined(separator: " \u{00B7} ")
            VStack(alignment: .leading, spacing: 8) {
                Button { withAnimation { showAlsoHeard.toggle() } } label: {
                    (Text("Also heard, not counted as questions: ").bold().foregroundColor(AppTheme.textPrimary)
                        + Text(summary + " ").foregroundColor(AppTheme.textSecondary)
                        + Text(showAlsoHeard ? "Hide" : "Show").bold().foregroundColor(AppTheme.terracotta600))
                        .font(.subheadline)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.plain)
                if showAlsoHeard {
                    FlowLayout(spacing: 6) {
                        ForEach(Array(tags.enumerated()), id: \.offset) { _, g in
                            alsoHeardChip("\u{201C}\(g.tag)?\u{201D}", g.timestampSec)
                        }
                        ForEach(Array(housekeeping.enumerated()), id: \.offset) { _, h in
                            alsoHeardChip("\u{201C}\(Redaction.withoutAddressedNames(h.quote))\u{201D}", h.timestampSec)
                        }
                    }
                }
            }
        }
    }

    private func alsoHeardChip(_ text: String, _ t: Double) -> some View {
        (Text(text + " ") + Text(mmss(t)).monospacedDigit())
            .font(.caption).foregroundStyle(AppTheme.textSecondary)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(AppTheme.cream, in: Capsule())
    }

    private func qx(_ t: Double, _ duration: Double, _ width: CGFloat) -> CGFloat {
        min(width - 7, max(7, width * CGFloat(t / duration)))
    }

    private func qcLane<C: View>(_ label: String, @ViewBuilder content: @escaping (CGFloat) -> C) -> some View {
        HStack(spacing: 8) {
            Text(label).font(.caption2.weight(.semibold)).foregroundStyle(AppTheme.textSecondary).frame(width: 62, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    Path { p in p.move(to: CGPoint(x: 0, y: 14)); p.addLine(to: CGPoint(x: geo.size.width, y: 14)) }
                        .stroke(AppTheme.hairline, lineWidth: 2)
                    content(geo.size.width)
                }
            }
            .frame(height: 28)
        }
    }

    private func qcPill(_ label: String, _ n: Int, on: Bool, swatch: AnyView, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                swatch
                Text(label)
                Text("\(n)").font(.caption2.weight(.bold))
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(on ? Color.white.opacity(0.2) : AppTheme.cream, in: Capsule())
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(on ? AppTheme.cream : AppTheme.textPrimary)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(on ? AppTheme.forest : AppTheme.card, in: Capsule())
            .overlay(Capsule().strokeBorder(on ? Color.clear : AppTheme.hairline, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }
}

/// "Right?", "okay?", "k?" — the tags a teacher ends a sentence with and
/// talks straight through — mirrors web/src/lib/questionTags.ts. They carry a
/// question mark but ask nothing of students, so the question count leaves
/// them out; counted from the transcript, as on the web. "Yes?" and "huh?"
/// are left out on purpose: they do ask something.
enum QuestionTags {
    private static let tags: Set<String> = ["right", "okay", "ok", "k", "kay", "you know", "yeah", "alright", "all right", "mhm", "mm-hmm"]

    /// Every tag the teacher said, in order. A tag is a question-marked piece
    /// of a teacher line that is nothing but one of the words above.
    static func find(_ segments: [TranscriptSegment]) -> [(tag: String, timestampSec: Double)] {
        var out: [(tag: String, timestampSec: Double)] = []
        for s in segments where s.speakerLabel == "Teacher" {
            var piece = ""
            for ch in s.text {
                if ch == "." || ch == "!" { piece = ""; continue }
                guard ch == "?" else { piece.append(ch); continue }
                var w = piece.lowercased().replacingOccurrences(of: ",", with: " ")
                if let r = w.range(of: "^\\s*(so|and|but|now)\\s+", options: .regularExpression) { w.removeSubrange(r) }
                w = w.trimmingCharacters(in: .whitespacesAndNewlines)
                if tags.contains(w) { out.append((w, s.startSec)) }
                piece = ""
            }
        }
        return out
    }
}

// MARK: - 3. Clarity & Content

struct ContentSection: View {
    let session: AudioSessionWithSegments
    let hardLook: AnyView?
    let onDiscuss: () -> Void

    private static let arcRole = ["opened": "Opened with", "built": "Built", "applied": "Applied to", "practiced": "Practiced", "closed": "Closed with"]
    private static let explanationLabel = ["example": "Gave an example", "analogy": "Used an analogy", "vocabulary": "Gave a meaning", "modeling": "Thought aloud"]
    private static let connectionLabel = ["prior": "Linked to earlier learning", "purpose": "Said why it matters", "closing": "Drew it together"]

    var body: some View {
        let moves = session.teachingMoves
        let arc = moves?.arc ?? []
        let explanations = moves?.explanations ?? []
        let notes = session.contentNotes?.notes ?? []
        let subject = session.lessonContent?.subject ?? session.contentNotes?.subject ?? "this subject"
        let keyTerms = session.lessonContent?.keyTerms ?? []
        let options = [
            PickOption(key: "opened", label: "Examples & explanations",
                       desc: "How you introduced the content and made it approachable \u{2014} examples, analogies, meanings, thinking aloud.",
                       items: explanations.map { EvidenceLine(tag: $0.kind.flatMap { Self.explanationLabel[$0] } ?? "Example or explanation", quote: $0.quote, timestampSec: $0.timestampSec) }),
            PickOption(key: "tied", label: "Linking ideas",
                       desc: "How you linked parts of the lesson to each other, to earlier learning, and to why it matters.",
                       items: (moves?.connections ?? []).map { EvidenceLine(tag: $0.kind.flatMap { Self.connectionLabel[$0] } ?? "Linked ideas", quote: $0.quote, timestampSec: $0.timestampSec) }),
            PickOption(key: "connections", label: "Real-world connections", desc: "Links you made to other texts, lessons, or students\u{2019} lives.",
                       items: (session.lessonContent?.connections ?? []).map { EvidenceLine(tag: "Connection", quote: $0.quote, timestampSec: $0.timestampSec) }),
        ]
        let lessonCount = options.reduce(0) { $0 + $1.items.count }
        let worked = notes.first { $0.label == "What worked" }
        let keep = worked.map { KeepLine(text: $0.text, quote: $0.excerpt, timestampSec: $0.timestampSec) }
            ?? explanations.first.map {
                KeepLine(text: "You \(($0.kind.flatMap { Self.explanationLabel[$0] } ?? "opened the content up").lowercased()) to make the content concrete.",
                         quote: $0.quote, timestampSec: $0.timestampSec)
            }
        var read = ["\u{201C}From your lesson\u{201D} is your own words, found in the transcript. Ideas for teaching \(subject) \u{2014} the specialist\u{2019}s notes, ways in, and where students get stuck \u{2014} are in the Content Specialist tab."]
        if !keyTerms.isEmpty {
            read.append("Vocabulary is counted from the transcript, so read the counts as \u{201C}at least\u{201D}: unusual terms are the words a recording most often mishears, and student counts include only what the microphone picked up.")
        }
        return SectionCard(
            section: .content, note: session.contentNarrative, keep: keep,
            tryNext: notes.first { $0.label == "Where it could go further" }?.text,
            howToRead: read, hardLook: hardLook, onDiscuss: onDiscuss
        ) {
            if !arc.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("How the lesson moved").font(.heading(.title3)).foregroundStyle(AppTheme.forest)
                    ForEach(Array(arc.enumerated()), id: \.offset) { i, s in
                        VStack(alignment: .leading, spacing: 3) {
                            Text((Self.arcRole[s.role] ?? s.role).uppercased()).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                            Text(s.title).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(mmss(s.startSec))\u{2013}\(i == arc.count - 1 ? "end" : mmss(s.endSec))")
                                .font(.caption.monospacedDigit()).foregroundStyle(AppTheme.textSecondary)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                PartHeading(title: "From your lesson", count: "\(lessonCount) moment\(lessonCount == 1 ? "" : "s")")
                Text("What you did to make the content clear, in your own words.")
                    .font(.body.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                if lessonCount == 0 {
                    Text("None of these were found in this lesson.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else {
                    CategoryPickerView(options: options, hint: "Tap a category")
                }
            }
            if !keyTerms.isEmpty { vocabulary(keyTerms) }
        }
    }

    private func vocabulary(_ terms: [AudioKeyTerm]) -> some View {
        let used = terms.filter { $0.studentCount > 0 }
        let onlyYou = terms.filter { $0.studentCount == 0 }
        return OptionalBlock(title: "Academic vocabulary", summary: "\(used.count) of \(terms.count) key terms were heard from students.") {
            HStack(spacing: 14) {
                HStack(spacing: 5) { Circle().fill(AppTheme.forest).frame(width: 10, height: 10); Text("You") }
                HStack(spacing: 5) { Circle().fill(AppTheme.gold).frame(width: 10, height: 10); Text("Students") }
                Text("Each dot = one time said").foregroundStyle(AppTheme.textSecondary)
            }
            .font(.caption)
            ForEach([("STUDENTS USED THESE \u{00B7} \(used.count)", used), ("ONLY YOU SAID THESE \u{00B7} \(onlyYou.count)", onlyYou)].filter { !$0.1.isEmpty }, id: \.0) { group in
                Text(group.0).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.forest).padding(.top, 6)
                ForEach(group.1, id: \.term) { t in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Text(t.term).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            if t.studentCount > t.teacherCount {
                                Text("students led").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.forest)
                                    .padding(.horizontal, 6).padding(.vertical, 2).background(AppTheme.mintTint, in: RoundedRectangle(cornerRadius: 4))
                            }
                        }
                        HStack(spacing: 14) {
                            pips(t.teacherCount, AppTheme.forest)
                            if t.studentCount > 0 {
                                pips(t.studentCount, AppTheme.gold)
                            } else {
                                Text("not heard").font(.caption2).foregroundStyle(AppTheme.textSecondary)
                                    .padding(.horizontal, 6)
                                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color(hex: 0xC9BFAD), style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    Divider()
                }
            }
        }
    }

    private func pips(_ n: Int, _ color: Color) -> some View {
        HStack(spacing: 3) {
            ForEach(0..<min(n, 10), id: \.self) { _ in Circle().fill(color).frame(width: 10, height: 10) }
            if n > 10 { Text("+\(n - 10)").font(.caption2).foregroundStyle(AppTheme.textSecondary) }
        }
    }
}

// MARK: - 4. Climate & Routines

struct RoutinesSection: View {
    let session: AudioSessionWithSegments
    let hardLook: AnyView?
    let onDiscuss: () -> Void

    private static let routineLabel = ["start": "Starting work", "transition": "Changing activities", "materials": "Materials",
                                       "help": "Getting help", "finish": "Finishing", "other": "Directions"]
    private static let partWord = ["task": "what to do", "steps": "the steps", "time": "how long", "product": "what to hand in"]

    private func named(_ parts: [String]) -> String {
        parts.isEmpty ? "named none of the four" : "named " + parts.map { Self.partWord[$0] ?? $0 }.joined(separator: ", ")
    }

    var body: some View {
        let moves = session.teachingMoves
        let directions = moves?.directions ?? []
        let typeAt = { (sec: Double) in moves?.routines?.directionTypes.first { $0.timestampSec == sec }?.type }
        let complete = directions.filter { $0.parts.count == 4 }
        let directionRows = directions.sorted { ($0.parts.count, -$0.timestampSec) > ($1.parts.count, -$1.timestampSec) }.map { d -> EvidenceLine in
            let tag = (typeAt(d.timestampSec).flatMap { Self.routineLabel[$0] }.map { "\($0) \u{00B7} " } ?? "") + named(d.parts)
            return EvidenceLine(tag: tag.prefix(1).uppercased() + tag.dropFirst(), quote: d.quote, timestampSec: d.timestampSec)
        }
        var byType: [(String, Int)] = []
        for d in directions {
            guard let t = typeAt(d.timestampSec), t != "other", let label = Self.routineLabel[t] else { continue }
            if let i = byType.firstIndex(where: { $0.0 == label }) { byType[i].1 += 1 } else { byType.append((label, 1)) }
        }
        let missingTime = directions.filter { !$0.parts.contains("time") }.count
        let directionFinding: String? = directions.isEmpty ? nil
            : directions.count == 1 ? "Your one set of directions \(directions[0].parts.isEmpty ? "named none of the four parts" : named(directions[0].parts))."
            : "\(complete.count) of your \(directions.count) directions named all four: what to do, the steps, how long, and what to hand in."
                + (missingTime > 0 && complete.count < directions.count ? " \(missingTime) didn\u{2019}t say how long." : "")

        let redirections: [AudioTeachingMoves.Redirection] = moves?.redirections
            ?? (session.redirectionLog ?? []).map { AudioTeachingMoves.Redirection(quote: $0.text, timestampSec: $0.timestampSec, clarity: nil) }
        let actionable = redirections.filter { $0.clarity == "actionable" }
        let vague = redirections.filter { $0.clarity == "vague" }
        let redirectRows = (actionable + vague + redirections.filter { $0.clarity == nil }).map {
            EvidenceLine(tag: $0.clarity == "actionable" ? "Said what to do" : $0.clarity == "vague" ? "Said only what to stop" : "Redirection",
                         quote: $0.quote, timestampSec: $0.timestampSec)
        }
        var redirectFinding: String? = redirections.isEmpty ? nil
            : redirections.count == 1 && redirections[0].clarity != nil
                ? (redirections[0].clarity == "actionable" ? "Your one redirection told students what to do." : "Your one redirection said what to stop, not what to do instead.")
            : actionable.count + vague.count > 0
                ? "\(actionable.count) of your \(redirections.count) redirection\(redirections.count == 1 ? "" : "s") told students what to do, not just what to stop."
            : "\(redirections.count) redirection\(redirections.count == 1 ? "" : "s")."

        // Keeping learning on track: the stretches where reminders came as a
        // pattern. Reads made before episodes existed fall back to whether an
        // ask held — never the number of bids.
        let esc = session.escalation
        let episodes: [AudioOnTrackEpisode]? = esc?.state == "found" ? esc?.episodes : nil
        let interruptions = esc?.interruptions ?? []
        let inEpisode = { (sec: Double) in
            (episodes ?? []).contains { sec >= ($0.startSec ?? 0) - 1 && sec <= ($0.endSec ?? $0.startSec ?? 0) + 1 }
        }
        let loneInterruptions = interruptions.filter { $0.timestampSec.map { !inEpisode($0) } ?? false }
        var onTrackRows = redirectRows.map { r -> EvidenceLine in
            guard let at = r.timestampSec,
                  interruptions.contains(where: { abs(($0.timestampSec ?? -99) - at) < 3 }) else { return r }
            return EvidenceLine(tag: "\(r.tag) \u{00B7} Paused your explanation", quote: r.quote, timestampSec: r.timestampSec)
        }
        if onTrackRows.isEmpty {
            onTrackRows = (episodes ?? []).map { EvidenceLine(tag: $0.title ?? "", quote: $0.lead?.quote ?? "", timestampSec: $0.lead?.timestampSec) }
        }
        onTrackRows = onTrackRows.filter { !($0.quote ?? "").isEmpty }
        if let episodes, !episodes.isEmpty {
            redirectFinding = episodes.count == 1
                ? "One stretch of the lesson where reminders came as a pattern, not one at a time."
                : "More than one stretch where reminders came as a pattern, not one at a time. The strongest is first."
        } else if esc?.state == "confirmed_none" || episodes != nil {
            redirectFinding = redirections.isEmpty ? nil : "Your reminders were routine: none came back as a repeated pattern."
        }
        let onTrackNote: AnyView? = (episodes != nil || esc?.state == "not_measurable")
            ? AnyView(OnTrackFindings(escalation: esc!, episodes: episodes ?? [], loneInterruptions: loneInterruptions))
            : nil

        let feedback = session.feedbackLog ?? []
        let specific = feedback.filter { $0.kind == "specific" }
        let corrective = (session.toneLog ?? []).filter { $0.kind == "corrective" }
        let help = moves?.routines?.helpInvites ?? []
        let encourageRows = specific.map { EvidenceLine(tag: "Named what was right", quote: $0.text, timestampSec: $0.timestampSec) }
            + help.map { EvidenceLine(tag: "Invited students to ask for help", quote: $0.quote, timestampSec: $0.timestampSec) }
            + corrective.map { EvidenceLine(tag: "Responded to a mistake", quote: $0.text, timestampSec: $0.timestampSec) }
            + feedback.filter { $0.kind == "generic" }.map { EvidenceLine(tag: "General praise", quote: $0.text, timestampSec: $0.timestampSec) }
        let encourageFinding: String? = !feedback.isEmpty
            ? "\(specific.count) of the \(feedback.count) times you responded to a student named what was right or wrong"
                + (help.isEmpty ? "" : ", and you invited students to ask for help \(help.count) time\(help.count == 1 ? "" : "s")") + "."
            : !help.isEmpty ? "You invited students to ask for help \(help.count) time\(help.count == 1 ? "" : "s")." : nil

        let keep = specific.first.map { KeepLine(text: "You named what was right, not just \u{201C}good\u{201D}.", quote: $0.text, timestampSec: $0.timestampSec) }
            ?? actionable.first.map { KeepLine(text: "Your redirection told students what to do.", quote: $0.quote, timestampSec: $0.timestampSec) }
            ?? complete.first.map { KeepLine(text: "Your directions named what to do, the steps, how long, and what to hand in.", quote: $0.quote, timestampSec: $0.timestampSec) }
        // Repeated redirections: the read the section shows when the report
        // has it; older reports keep the Keeping learning on track view until
        // they are re-read.
        let repeated = esc?.repeatedRedirections
        let redirectionItems = repeated.map { r in
            r.corrections.map { c in
                EvidenceLine(tag: c.label ?? "Redirection",
                             text: c.quote == nil ? "Too short or unclear to quote on its own." : nil,
                             quote: c.quote, timestampSec: c.timestampSec)
            }
        } ?? onTrackRows
        let total = directionRows.count + redirectionItems.count + encourageRows.count

        return SectionCard(
            section: .routines, note: session.climateNarrative, keep: keep, tryNext: session.nextSteps?.climate,
            howToRead: [
                "Everything here is from your own words. A direction is counted once however many sentences it runs to, and each says which of the four parts it named: what to do, the steps, how long, and what to hand in.",
                "Tone isn\u{2019}t judged on this page: a transcript can\u{2019}t hear warmth or sarcasm, and a student\u{2019}s line can be filed as yours. The hard look is where a stricter reading lives, if you want one.",
            ],
            hardLook: hardLook, onDiscuss: onDiscuss
        ) {
            VStack(alignment: .leading, spacing: 12) {
                PartHeading(title: "From your lesson", count: "\(total) moments")
                Text("How your words set up the work, kept it on track, and encouraged students.")
                    .font(.body.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if total == 0 && repeated == nil {
                    Text("No directions, redirections or feedback to a student were found in this lesson.")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else {
                    CategoryPickerView(options: [
                        PickOption(key: "directions", label: "Directions & routines",
                                   desc: "Directions for starting work, changing activities, materials, getting help and finishing \u{2014} and which of the four parts each named.",
                                   items: directionRows, finding: directionFinding, chips: byType),
                        repeated.map { r in
                            PickOption(key: "redirection", label: "Repeated redirections",
                                       desc: "Your words correcting behavior, each filed under what it was about. One correction tells little; the same one coming back is worth a second look.",
                                       items: redirectionItems, finding: r.headline,
                                       noteView: AnyView(RepeatedRedirectionsPanel(read: r)),
                                       alwaysShow: r.state != "unread" || !redirectionItems.isEmpty)
                        } ?? PickOption(key: "redirection", label: "Keeping learning on track",
                                   desc: "Your words addressing behavior, apart from corrections about the content. One reminder tells little; what is worth a second look is the same reminder coming back, or an explanation that kept stopping.",
                                   items: onTrackRows, finding: redirectFinding,
                                   note: onTrackNote == nil ? escalationNote : nil, noteView: onTrackNote),
                        PickOption(key: "encouragement", label: "Encouragement & respect",
                                   desc: "What your words recognized, invitations to ask for help, and how you responded to mistakes.",
                                   items: encourageRows, finding: encourageFinding),
                    ], hint: "Tap a category")
                }
            }
            if !directions.isEmpty { directionsGrid(directions, complete: complete.count) }
        }
    }

    /// Whether an ask held — never the number of bids.
    private var escalationNote: String? {
        guard let e = session.escalation else { return nil }
        if e.state == "found", let c = e.clusters?.first, let start = c.startSec {
            let quote = c.quote.map { " \u{2014} \u{201C}\($0.trimmingCharacters(in: CharacterSet(charactersIn: ".!?")))\u{201D}" } ?? ""
            return "One ask needed repeating around \(mmss(start))\(quote)."
        }
        return e.state == "confirmed_none" ? "Your asks held: none needed repeating." : nil
    }

    private func directionsGrid(_ directions: [AudioTeachingMoves.Direction], complete: Int) -> some View {
        OptionalBlock(title: "Your directions, part by part", summary: "\(complete) of \(directions.count) named all four parts.") {
            Grid(horizontalSpacing: 6, verticalSpacing: 6) {
                GridRow {
                    Text("")
                    ForEach(["What to do", "Steps", "How long", "Hand in"], id: \.self) {
                        Text($0).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary).multilineTextAlignment(.center)
                    }
                }
                ForEach(Array(directions.sorted { $0.timestampSec < $1.timestampSec }.enumerated()), id: \.offset) { _, d in
                    GridRow {
                        Text(mmss(d.timestampSec)).font(.caption.monospacedDigit()).foregroundStyle(AppTheme.textSecondary)
                        ForEach(["task", "steps", "time", "product"], id: \.self) { part in
                            Group {
                                if d.parts.contains(part) {
                                    RoundedRectangle(cornerRadius: 5).fill(AppTheme.forest)
                                } else {
                                    RoundedRectangle(cornerRadius: 5).strokeBorder(Color(hex: 0xC9BFAD), style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                                }
                            }
                            .frame(height: 22)
                            .accessibilityLabel("\(Self.partWord[part]!): \(d.parts.contains(part) ? "named" : "not named")")
                        }
                    }
                }
            }
            Text("A filled square is a part the direction named.").font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }
}

/// Keeping learning on track — mirrors `AudioCoaching.tsx`'s
/// `OnTrackFindings`: each stretch where reminders came as a pattern, as one
/// teacher quote and its time, a short explanation, the related quotes behind
/// "More evidence", and a next step only when the server judged the pattern
/// specific enough to point at one. The copy is the server's; never a count.
struct OnTrackFindings: View {
    let escalation: AudioEscalation
    let episodes: [AudioOnTrackEpisode]
    let loneInterruptions: [AudioEscalationRepeat]

    var body: some View {
        if escalation.state == "not_measurable" {
            if let reason = escalation.reason {
                Text(reason).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(episodes.enumerated()), id: \.offset) { _, e in
                    PatternCard(title: e.title, lead: e.lead, unclear: "The wording here was too unclear to quote.",
                                pattern: e.pattern, more: e.more ?? [], nextStep: e.nextStep)
                }
                ForEach(Array(loneInterruptions.enumerated()), id: \.offset) { _, i in
                    let quote = i.quote.map { " (\u{201C}\($0.replacingOccurrences(of: "[.!?]+$", with: "", options: .regularExpression))\u{201D})" } ?? ""
                    Text("At \(mmss(i.timestampSec ?? 0)) you paused an explanation to address behavior\(quote) and went straight back to it. Once on its own, that is a routine reminder.")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// Repeated redirections — mirrors `AudioCoaching.tsx`'s
/// `RepeatedRedirectionsPanel`: one card per expectation the teacher returned
/// to, then whether the teacher's voice was heard throughout. No next step,
/// no claim that a correction failed, and no count in the copy.
struct RepeatedRedirectionsPanel: View {
    let read: AudioRepeatedRedirections

    var body: some View {
        if read.state == "unread" {
            Text("This part of the lesson couldn\u{2019}t be read for this report.")
                .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(read.findings.enumerated()), id: \.offset) { _, f in
                    PatternCard(title: f.title, lead: f.lead, unclear: "The wording here was too short or unclear to quote.",
                                pattern: f.pattern, more: f.more ?? [], nextStep: nil)
                }
                if let note = read.coverageNote, !note.isEmpty {
                    Text(note).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !read.corrections.isEmpty {
                    Text("Behavior corrections in this lesson")
                        .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 4)
                }
            }
        }
    }
}

/// One pattern: a title, the lead teacher quote and its time, what the
/// pattern was, the other quotes behind "More evidence", and a next step
/// only when there is one. Shared by both readings of Climate & Routines.
private struct PatternCard: View {
    let title: String?
    let lead: AudioEscalationRepeat?
    let unclear: String
    let pattern: String?
    let more: [AudioEscalationRepeat]
    let nextStep: String?
    @State private var showMore = false

    var body: some View {
        let more = self.more.filter { !($0.quote ?? "").isEmpty }
        VStack(alignment: .leading, spacing: 8) {
            if let title {
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let lead {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Group {
                        if let q = lead.quote {
                            Text("\u{201C}\(q)\u{201D}").foregroundStyle(AppTheme.textPrimary)
                        } else {
                            Text(unclear).foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                    .font(.subheadline).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    if let at = lead.timestampSec {
                        Text(mmss(at)).font(.caption.monospaced()).foregroundStyle(AppTheme.textSecondary)
                    }
                }
            }
            if let pattern {
                Text(pattern).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !more.isEmpty {
                Button { withAnimation { showMore.toggle() } } label: {
                    Text(showMore ? "More evidence \u{25BE}" : "More evidence \u{25B8}")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                }
                .buttonStyle(.plain)
                if showMore {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(more.enumerated()), id: \.offset) { _, m in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text("\u{201C}\(m.quote ?? "")\u{201D}").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                                if let at = m.timestampSec {
                                    Text(mmss(at)).font(.caption.monospaced()).foregroundStyle(AppTheme.textSecondary)
                                }
                            }
                        }
                    }
                }
            }
            if let next = nextStep, !next.isEmpty {
                (Text("Next step: ").bold().foregroundColor(AppTheme.forest) + Text(next).foregroundColor(AppTheme.textPrimary))
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.terracotta600.opacity(0.3), lineWidth: 1.5))
    }
}
