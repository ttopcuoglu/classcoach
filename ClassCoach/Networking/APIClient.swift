import Foundation

enum APIError: Error, LocalizedError {
    case notSignedIn
    case server(status: Int, message: String)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .notSignedIn:
            return "Not signed in."
        case .server(_, let message):
            return message
        case .transport(let error):
            return error.localizedDescription
        }
    }
}

/// Thin async wrapper around `URLSession`, mirroring `web/src/lib/api.ts`'s
/// `request()` — same backend (`server/`), same JSON shapes, just a
/// bearer token instead of the web client's session cookie (see
/// server/src/lib/auth.ts's `bearerToken` fallback).
final class APIClient {
    static let shared = APIClient()

    /// TODO: replace with the real deployed backend URL once Wivoza is
    /// live (see server/.env's FRONTEND_ORIGINS / Render dashboard) — no
    /// production URL has been committed anywhere in this repo yet.
    private let baseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:3001")!
        #else
        return URL(string: "https://wivoza-api.onrender.com")!
        #endif
    }()

    private init() {}

    func request<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil
    ) async throws -> Response {
        var urlRequest = URLRequest(url: baseURL.appendingPathComponent(path))
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await AuthManager.shared.token {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            urlRequest.httpBody = try encodeJSONBody(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: urlRequest)
        } catch {
            throw APIError.transport(error)
        }

        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(statusCode) else {
            let message = (try? JSONDecoder().decode(ServerErrorBody.self, from: data))?.error
                ?? "Request failed (\(statusCode))."
            throw APIError.server(status: statusCode, message: message)
        }

        return try JSONDecoder().decode(Response.self, from: data)
    }

    /// Multipart file upload (e.g. the recorded audio for transcription) —
    /// same `field name / filename` pattern as `web/src/lib/api.ts`'s
    /// hand-rolled `FormData` uploads, since those bypass the JSON-only
    /// `request()` helper there too.
    func upload<Response: Decodable>(
        _ path: String,
        fileData: Data,
        fieldName: String,
        filename: String,
        mimeType: String
    ) async throws -> Response {
        let boundary = "Boundary-\(UUID().uuidString)"
        var urlRequest = URLRequest(url: baseURL.appendingPathComponent(path))
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = await AuthManager.shared.token {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        urlRequest.httpBody = body

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: urlRequest)
        } catch {
            throw APIError.transport(error)
        }

        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(statusCode) else {
            let message = (try? JSONDecoder().decode(ServerErrorBody.self, from: data))?.error
                ?? "Request failed (\(statusCode))."
            throw APIError.server(status: statusCode, message: message)
        }

        return try JSONDecoder().decode(Response.self, from: data)
    }

    /// Raw authenticated GET, for endpoints that return a non-JSON body
    /// (e.g. `/api/tts`'s streamed `audio/mpeg`) — same auth header as
    /// `request(_:)`, but returns the bytes as-is instead of decoding JSON.
    func rawGet(_ path: String, queryItems: [URLQueryItem] = []) async throws -> Data {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !queryItems.isEmpty { components.queryItems = queryItems }
        var urlRequest = URLRequest(url: components.url!)
        if let token = await AuthManager.shared.token {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: urlRequest)
        } catch {
            throw APIError.transport(error)
        }

        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(statusCode) else {
            let message = (try? JSONDecoder().decode(ServerErrorBody.self, from: data))?.error
                ?? "Request failed (\(statusCode))."
            throw APIError.server(status: statusCode, message: message)
        }
        return data
    }

    private struct ServerErrorBody: Decodable {
        let error: String
    }
}

/// `Encodable` existentials can't be passed directly to `JSONEncoder.encode`
/// (it needs a concrete type) — this box forwards to the wrapped value.
/// Deliberately a free function, not a same-named `JSONEncoder` extension:
/// naming it `encode` there caused Swift to resolve the call inside its own
/// body back to itself instead of the stdlib's generic `encode<T>`, recursing
/// until the stack overflowed.
private func encodeJSONBody(_ value: Encodable) throws -> Data {
    struct AnyEncodable: Encodable {
        let value: Encodable
        func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
    }
    return try JSONEncoder().encode(AnyEncodable(value: value))
}
