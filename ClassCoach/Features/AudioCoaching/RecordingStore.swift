import Foundation
import AVFoundation

/// Where a recording lives while it is being made, and how it survives the app
/// not living that long.
///
/// One `AVAudioRecorder` running for fifty minutes writes audio to disk the
/// whole time but only finalises the file on `stop()` — the MPEG-4 index is
/// written at the end. A phone that dies at minute forty therefore leaves a
/// file with all the audio and no way to open it. It also used to live in
/// `temporaryDirectory`, which iOS purges at will, and nothing recorded where
/// it was, so a relaunched app could not have found it anyway.
///
/// So a recording is a *series* of chunks, each one stopped and finalised
/// before the next begins, written beside a manifest that says which session
/// they belong to. A failure costs the chunk in flight — minutes — instead of
/// the period. At Stop they are merged back into the single file the upload
/// and the server already expect, which is what keeps this change local: one
/// Deepgram call over the whole class, so speaker labels stay consistent.
enum RecordingStore {
    /// Short enough that losing one is survivable, long enough that a class
    /// period is a handful of files rather than a hundred.
    static let chunkSeconds: TimeInterval = 5 * 60

    /// A recording ends itself here. Not a cost control — a forgotten recorder
    /// costs a couple of dollars — but a consent one. `consentConfirmed` is
    /// collected once, for a class. A session still running at 3pm has
    /// recorded the hallway, the staff room, a conversation about a student
    /// and people who were never in the room and never agreed to anything.
    ///
    /// Ninety minutes clears a block schedule and a double period. Anything
    /// past that is far more likely to be a mistake than a lesson.
    static let maxRecordingSeconds: TimeInterval = 90 * 60

    struct Manifest: Codable {
        let sessionId: String
        let startedAt: Date
        var chunkNames: [String]
        var accumulatedSec: Double
    }

    /// Application Support, not `temporaryDirectory`: the system may purge
    /// temporary files whenever it likes, including while a class is being
    /// recorded.
    private static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Recordings", isDirectory: true)
    }

    static func directory(for sessionId: String) -> URL {
        root.appendingPathComponent(sessionId, isDirectory: true)
    }

    private static func manifestURL(for sessionId: String) -> URL {
        directory(for: sessionId).appendingPathComponent("manifest.json")
    }

    static func begin(sessionId: String) throws -> Manifest {
        let dir = directory(for: sessionId)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let manifest = Manifest(sessionId: sessionId, startedAt: Date(), chunkNames: [], accumulatedSec: 0)
        try save(manifest)
        return manifest
    }

    static func save(_ manifest: Manifest) throws {
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: manifestURL(for: manifest.sessionId), options: .atomic)
    }

    static func load(sessionId: String) -> Manifest? {
        guard let data = try? Data(contentsOf: manifestURL(for: sessionId)) else { return nil }
        return try? JSONDecoder().decode(Manifest.self, from: data)
    }

    /// Recordings left behind by a process that never reached Stop. The one
    /// the app is currently making is excluded by the caller.
    static func unfinished() -> [Manifest] {
        guard let dirs = try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return dirs
            .compactMap { load(sessionId: $0.lastPathComponent) }
            .filter { !$0.chunkNames.isEmpty }
            .sorted { $0.startedAt > $1.startedAt }
    }

    static func chunkURL(sessionId: String, index: Int) -> URL {
        directory(for: sessionId).appendingPathComponent(String(format: "chunk-%03d.m4a", index))
    }

    static func discard(sessionId: String) {
        try? FileManager.default.removeItem(at: directory(for: sessionId))
    }

    /// Joins the chunks back into one m4a, so everything downstream — the
    /// background upload, the server, Deepgram's diarization — sees exactly
    /// what it saw before chunking existed.
    ///
    /// A chunk that will not open is skipped rather than failing the merge:
    /// the only one that can be damaged is the last, and losing five minutes
    /// of a class is not a reason to lose the other forty-five.
    static func merge(_ manifest: Manifest) async throws -> URL {
        let dir = directory(for: manifest.sessionId)
        let urls = manifest.chunkNames.map { dir.appendingPathComponent($0) }

        if urls.count == 1, FileManager.default.fileExists(atPath: urls[0].path) {
            return urls[0]
        }

        let composition = AVMutableComposition()
        guard let track = composition.addMutableTrack(
            withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw MergeError.noTrack
        }

        var cursor = CMTime.zero
        for url in urls {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let asset = AVURLAsset(url: url)
            guard let source = try? await asset.loadTracks(withMediaType: .audio).first,
                  let duration = try? await asset.load(.duration),
                  duration.seconds > 0
            else { continue }
            // `try?`, not `try`: a truncated chunk can still report a track
            // and a duration and then fail on insert, and failing the whole
            // merge over the one chunk that was always going to be damaged is
            // exactly the loss this is here to prevent.
            guard (try? track.insertTimeRange(
                CMTimeRange(start: .zero, duration: duration), of: source, at: cursor
            )) != nil else { continue }
            cursor = CMTimeAdd(cursor, duration)
        }

        guard cursor.seconds > 0 else { throw MergeError.nothingUsable }

        let output = dir.appendingPathComponent("merged.m4a")
        try? FileManager.default.removeItem(at: output)
        guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
            throw MergeError.noExporter
        }
        export.outputURL = output
        export.outputFileType = .m4a
        await export.export()
        guard export.status == .completed else {
            throw export.error ?? MergeError.exportFailed
        }
        return output
    }

    enum MergeError: LocalizedError {
        case noTrack, noExporter, exportFailed, nothingUsable

        var errorDescription: String? {
            switch self {
            case .nothingUsable: return "This recording could not be recovered."
            default: return "Could not prepare the recording for upload."
            }
        }
    }
}
