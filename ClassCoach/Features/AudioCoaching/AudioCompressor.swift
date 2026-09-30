import AVFoundation

/// Shrinks a finished recording for the journey to the server.
///
/// Recording is uncompressed 16 kHz PCM, because that is the only thing that
/// survives the app being killed mid-lesson — see RecordingStore. But PCM is
/// ~1.9 MB a minute, so a 60-minute class is ~115 MB, and a teacher on one bar
/// walking to their car was watching that upload for the length of the lesson.
///
/// The recoverability only ever mattered for a recording that was interrupted.
/// Once a teacher has pressed Stop the file is complete and there is nothing
/// left to protect, so it is compressed to AAC for the upload: ~115 MB becomes
/// ~16 MB, and the worst case goes from an hour to minutes.
///
/// Deliberately not AVAssetExportSession. That is what made an earlier attempt
/// at this fail — it does not finish once iOS suspends the app, which is
/// exactly what happens when a phone goes into a pocket at the end of a class.
/// Reading and writing the file ourselves is ours to drive, runs far faster
/// than realtime, and stops where it stops.
enum AudioCompressor {
    /// AAC at 32 kbps mono. Speech at 16 kHz, which is all the recording holds
    /// and all speech recognition uses.
    private static let outputSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 32000,
    ]

    /// Returns a compressed copy to upload, or the original if anything at all
    /// goes wrong. A large upload is worse than a small one; no upload is worse
    /// than both, so every failure here falls back rather than throwing.
    static func compressedForUpload(_ source: URL) -> URL {
        guard source.pathExtension.lowercased() == "wav" else { return source }

        let target = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).m4a")
        do {
            let input = try AVAudioFile(forReading: source)
            let output = try AVAudioFile(forWriting: target, settings: outputSettings)
            // A second at a time: peak memory stays flat whether the class ran
            // five minutes or ninety.
            let frames = AVAudioFrameCount(input.processingFormat.sampleRate)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: frames) else {
                return source
            }
            while input.framePosition < input.length {
                try input.read(into: buffer)
                if buffer.frameLength == 0 { break }
                try output.write(from: buffer)
            }
            return target
        } catch {
            // Half a file is worse than none: a partial .m4a would upload
            // cleanly and transcribe short.
            try? FileManager.default.removeItem(at: target)
            print("[audio] could not compress for upload, sending the original: \(error)")
            return source
        }
    }

    /// Removes a compressed copy once it has been handed to the uploader. Does
    /// nothing when the fallback was taken and `uploaded` IS the recording —
    /// that one belongs to RecordingStore and is deleted when the transcript
    /// lands.
    static func discardCopy(_ uploaded: URL, original: URL) {
        guard uploaded != original else { return }
        try? FileManager.default.removeItem(at: uploaded)
    }
}
