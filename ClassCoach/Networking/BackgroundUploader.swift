import Foundation

/// Uploads a lesson recording with a background `URLSession`, so pressing Stop
/// and locking the phone does not throw the class away.
///
/// A normal `URLSession` task belongs to the app: suspend the app and the
/// transfer stops, kill it and the transfer is gone. A fifty-minute recording
/// is tens of megabytes on school wifi, which is long enough that a teacher
/// will reasonably pocket the phone halfway through. A background session
/// hands the file to the system instead — iOS finishes the transfer whether or
/// not the app is running, and relaunches it afterwards to hear the result.
///
/// Two consequences shape everything below:
///   - the body must be a FILE, not `Data`, so the multipart envelope is
///     written to disk first and deleted when the task ends
///   - the delegate can be called in a freshly launched process, so nothing
///     here may depend on a view being alive
///
/// The server side of this is `mode=async` in `POST /:id/transcribe`: it
/// stores the audio, answers 202, and transcribes without us. So the only
/// thing this has to survive is the upload itself.
final class BackgroundUploader: NSObject {
    static let shared = BackgroundUploader()

    /// Posted when an upload finishes, succeeded or not, including when the
    /// app was relaunched to be told. Listeners refresh from the server rather
    /// than trusting anything in this notification.
    static let didFinishUpload = Notification.Name("BackgroundUploaderDidFinishUpload")

    /// Set by the app delegate when iOS wakes us solely to deliver these
    /// events; must be called once they are all in.
    var backgroundEventsCompletionHandler: (() -> Void)?

    private let identifier = "com.wivoza.app.background-upload"
    private var bodyFiles: [Int: URL] = [:]
    private var responseData: [Int: Data] = [:]
    private let lock = NSLock()

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: identifier)
        // A class recording is worth finishing even on a slow staffroom
        // connection; discretionary would let iOS wait for wifi and a charger.
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    /// Call once at launch so a session left running by a previous process is
    /// re-adopted and its delegate callbacks arrive.
    func reconnect() {
        _ = session
    }

    struct UploadResult {
        let sessionId: String
        let success: Bool
        let message: String?
    }

    private(set) var lastResult: UploadResult?

    /// Hands the recording to the system. Returns as soon as the task is
    /// queued — not when the upload completes.
    func startTranscription(
        sessionId: String,
        audioFileURL: URL,
        durationSec: Double,
        token: String?,
        baseURL: URL
    ) throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/audio-sessions/\(sessionId)/transcribe"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        // Read by the delegate in a process that may not remember starting this.
        request.setValue(sessionId, forHTTPHeaderField: "X-Wivoza-Session-Id")

        let bodyURL = try writeMultipartBody(
            boundary: boundary,
            audioFileURL: audioFileURL,
            durationSec: durationSec
        )

        let task = session.uploadTask(with: request, fromFile: bodyURL)
        task.taskDescription = sessionId
        lock.lock()
        bodyFiles[task.taskIdentifier] = bodyURL
        lock.unlock()
        task.resume()
    }

    /// The envelope, streamed to a temp file rather than built in memory: a
    /// fifty-minute recording held as `Data` twice over is how a phone with a
    /// full photo library gets the app killed mid-upload.
    private func writeMultipartBody(boundary: String, audioFileURL: URL, durationSec: Double) throws -> URL {
        let bodyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).multipart")
        FileManager.default.createFile(atPath: bodyURL.path, contents: nil)
        let handle = try FileHandle(forWritingTo: bodyURL)
        defer { try? handle.close() }

        func write(_ string: String) throws {
            try handle.write(contentsOf: Data(string.utf8))
        }

        for (name, value) in [("mode", "async"), ("durationSec", String(Int(durationSec.rounded())))] {
            try write("--\(boundary)\r\n")
            try write("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            try write("\(value)\r\n")
        }

        try write("--\(boundary)\r\n")
        // Described from the file, not assumed: a recording made before the
        // move to WAV can still be waiting here, and the server hands this
        // straight to Deepgram.
        try write("Content-Disposition: form-data; name=\"audio\"; filename=\"session-audio.\(audioFileURL.pathExtension)\"\r\n")
        try write("Content-Type: \(RecordingStore.mimeType(for: audioFileURL))\r\n\r\n")

        // Chunked so peak memory stays flat regardless of how long the class was.
        let reader = try FileHandle(forReadingFrom: audioFileURL)
        defer { try? reader.close() }
        while let chunk = try reader.read(upToCount: 512 * 1024), !chunk.isEmpty {
            try handle.write(contentsOf: chunk)
        }

        try write("\r\n--\(boundary)--\r\n")
        return bodyURL
    }

    /// `APIClient` keeps its own copy private; duplicating one field is
    /// cheaper than widening that type's surface for this.
    private struct ErrorBody: Decodable {
        let error: String
    }

    private func cleanUp(taskIdentifier: Int) -> (body: URL?, data: Data?) {
        lock.lock()
        let body = bodyFiles.removeValue(forKey: taskIdentifier)
        let data = responseData.removeValue(forKey: taskIdentifier)
        lock.unlock()
        if let body { try? FileManager.default.removeItem(at: body) }
        return (body, data)
    }
}

extension BackgroundUploader: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock()
        responseData[dataTask.taskIdentifier, default: Data()].append(data)
        lock.unlock()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let sessionId = task.taskDescription
            ?? task.originalRequest?.value(forHTTPHeaderField: "X-Wivoza-Session-Id")
            ?? ""
        let (_, data) = cleanUp(taskIdentifier: task.taskIdentifier)
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0

        var message: String?
        var success = false
        if let error {
            message = error.localizedDescription
        } else if (200..<300).contains(status) {
            success = true
        } else {
            message = data
                .flatMap { try? JSONDecoder().decode(ErrorBody.self, from: $0) }?
                .error ?? "Upload failed (\(status))."
        }

        lastResult = UploadResult(sessionId: sessionId, success: success, message: message)
        NotificationCenter.default.post(
            name: Self.didFinishUpload,
            object: nil,
            userInfo: ["sessionId": sessionId, "success": success, "message": message as Any]
        )
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundEventsCompletionHandler?()
            self.backgroundEventsCompletionHandler = nil
        }
    }
}
