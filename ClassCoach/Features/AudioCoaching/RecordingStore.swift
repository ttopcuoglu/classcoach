import Foundation
import AVFoundation

/// Where a recording lives while it is being made, and how it survives the app
/// not living that long.
///
/// This was briefly a series of chunks merged at Stop, so that a phone dying
/// mid-lesson cost five minutes instead of the period. It worked, but the
/// merge sat between Stop and the teacher getting their screen back, and
/// `AVAssetExportSession` does not finish once iOS suspends the app — which is
/// what happens the moment a phone goes in a pocket at the end of a class. A
/// real lesson was stranded behind a progress ring for an hour. Reverted: one
/// recording is one file again, and Stop has nothing to do but hand it over.
///
/// What survived the revert is everything that was not chunking. The file is
/// in Application Support rather than `temporaryDirectory`, which the system
/// may purge whenever it likes. A manifest records that it exists and which
/// session it belongs to, so a recording whose upload never arrived can be
/// found and offered back rather than silently lost.
///
/// The format is 16 kHz mono WAV, and that is the whole reason a recording now
/// survives the app not surviving. An MPEG-4 file is only indexed on `stop()`,
/// so a recording interrupted at minute forty held all of its audio and none of
/// the index, and would not open — a real lesson was lost that way. Moving to a
/// different container does not help: AAC is variable-bitrate and needs a
/// packet table written at the end wherever it lives. Uncompressed PCM needs no
/// index at all, so a file that stops being written mid-lesson still plays up to
/// the moment it stopped.
///
/// The cost is honest and worth stating: 16 kHz mono PCM is about 1.9 MB a
/// minute against roughly 0.27 for the AAC it replaced, so a 45-minute class is
/// ~88 MB rather than ~12 MB. That is a worse upload on cellular, and it is the
/// price of a lesson not being lost outright. `BatteryCheck` still warns,
/// because a phone that dies still ends the recording — it just no longer takes
/// the recording with it.
enum RecordingStore {
    /// A recording ends itself here. Not a cost control — a forgotten recorder
    /// costs a couple of dollars — but a consent one. `consentConfirmed` is
    /// collected once, for a class. A session still running at 3pm has
    /// recorded the hallway, the staff room, a conversation about a student
    /// and people who were never in the room and never agreed to anything.
    ///
    /// Ninety minutes clears a block schedule and a double period. Anything
    /// past that is far more likely to be a mistake than a lesson.
    static let maxRecordingSeconds: TimeInterval = 90 * 60

    /// Local audio is not kept forever waiting for a confirmation that will
    /// never come — a session the teacher deleted, an app signed into a
    /// different account. A week is long enough for any real retry.
    static let keepLocalAudioDays = 7

    private static let fileName = "recording.wav"
    /// Recordings made before the move to WAV. A teacher who updates the app
    /// with one still waiting to send must not have it quietly vanish because
    /// the code went looking for a different name.
    private static let legacyFileName = "recording.m4a"

    struct Manifest: Codable {
        let sessionId: String
        let startedAt: Date
        var accumulatedSec: Double
    }

    private static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Recordings", isDirectory: true)
    }

    static func directory(for sessionId: String) -> URL {
        root.appendingPathComponent(sessionId, isDirectory: true)
    }

    /// Where this session's audio is, whichever format it was recorded in. A
    /// new recording has neither file yet and gets the current name.
    static func audioURL(for sessionId: String) -> URL {
        let dir = directory(for: sessionId)
        let current = dir.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: current.path) { return current }
        let legacy = dir.appendingPathComponent(legacyFileName)
        if FileManager.default.fileExists(atPath: legacy.path) { return legacy }
        return current
    }

    /// What to tell the server a file is. Derived from the file rather than
    /// hardcoded, because a legacy .m4a awaiting recovery still has to be
    /// described correctly — the server passes this straight to Deepgram.
    static func mimeType(for url: URL) -> String {
        url.pathExtension.lowercased() == "wav" ? "audio/wav" : "audio/m4a"
    }

    private static func manifestURL(for sessionId: String) -> URL {
        directory(for: sessionId).appendingPathComponent("manifest.json")
    }

    /// The recording being made right now, if there is one.
    ///
    /// Deliberately in memory: a process that dies mid-lesson comes back with
    /// this empty, which is exactly when the recording SHOULD be offered back.
    /// It lives here because the list cannot ask the recorder — it does not own
    /// one — and the session it used to compare against is never set for a
    /// recording the panel started itself, so a live recording was being judged
    /// as an abandoned one and deleted out from under itself.
    private(set) static var activeSessionId: String?

    static func endActive() {
        activeSessionId = nil
    }

    static func begin(sessionId: String) throws -> Manifest {
        let dir = directory(for: sessionId)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        activeSessionId = sessionId
        let manifest = Manifest(sessionId: sessionId, startedAt: Date(), accumulatedSec: 0)
        try save(manifest)
        return manifest
    }

    static func save(_ manifest: Manifest) throws {
        try JSONEncoder().encode(manifest).write(to: manifestURL(for: manifest.sessionId), options: .atomic)
    }

    static func load(sessionId: String) -> Manifest? {
        guard let data = try? Data(contentsOf: manifestURL(for: sessionId)) else { return nil }
        return try? JSONDecoder().decode(Manifest.self, from: data)
    }

    /// Recordings still on this phone. The caller decides which of them the
    /// server has already transcribed.
    static func stored() -> [Manifest] {
        guard let dirs = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else {
            return []
        }
        return dirs
            .compactMap { load(sessionId: $0.lastPathComponent) }
            .filter { FileManager.default.fileExists(atPath: audioURL(for: $0.sessionId).path) }
            .sorted { $0.startedAt > $1.startedAt }
    }

    /// Moves a recording to a different session id. Used when the session it
    /// was made under no longer exists on the server and a fresh one has to
    /// take its place — the manifest has to follow, or reconcileLocalAudio
    /// would keep offering back a recording that has already been sent.
    static func rekey(from oldId: String, to newId: String) throws {
        let from = directory(for: oldId)
        let to = directory(for: newId)
        try? FileManager.default.removeItem(at: to)
        try FileManager.default.moveItem(at: from, to: to)
        if var manifest = load(sessionId: newId) {
            manifest = Manifest(sessionId: newId, startedAt: manifest.startedAt, accumulatedSec: manifest.accumulatedSec)
            try save(manifest)
        }
    }

    /// Whether this session already has audio on disk.
    ///
    /// A session that does must never be recorded into again: `begin` writes a
    /// fresh manifest with `accumulatedSec: 0` and `AVAudioRecorder` truncates
    /// the file at the same path, so the lesson already sitting there is gone
    /// with no warning and nothing to recover.
    static func hasRecording(sessionId: String) -> Bool {
        FileManager.default.fileExists(atPath: audioURL(for: sessionId).path)
    }

    static func discard(sessionId: String) {
        try? FileManager.default.removeItem(at: directory(for: sessionId))
    }

    /// Whether a stored recording can actually be opened.
    ///
    /// The one that cannot is the one the app never got to finish: an MPEG-4
    /// file interrupted before `stop()` has no index. Offering a teacher a
    /// recording that will only fail at the server is worse than telling them
    /// nothing, so recovery asks this first.
    static func isPlayable(sessionId: String) async -> Bool {
        await audioDuration(sessionId: sessionId) != nil
    }

    /// How much audio the file actually holds — which is not the same as the
    /// time the app spent believing it was recording. An interruption stops
    /// the recorder while the clock runs on, so the manifest can claim
    /// minutes that were never captured. Recovery reports this instead, and
    /// falls back to the manifest only when the file cannot be read at all.
    static func audioDuration(sessionId: String) async -> Double? {
        let asset = AVURLAsset(url: audioURL(for: sessionId))
        guard let duration = try? await asset.load(.duration) else { return nil }
        let seconds = duration.seconds
        return seconds.isFinite && seconds > 0.5 ? seconds : nil
    }
}
