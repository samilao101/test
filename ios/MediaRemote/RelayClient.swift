import Foundation

struct RelayStatus: Decodable {
    let connected: Int
    let state: MediaState?
}

struct MediaState: Decodable {
    let playing: Bool
    let tabs: [MediaTab]
    let resumable: Int
}

struct MediaTab: Decodable, Hashable {
    let title: String
    let url: String
}

enum RelayAction: String {
    case toggle, pause, play
}

enum RelayError: LocalizedError {
    case missingURL
    case missingToken
    case unauthorized
    case noBrowser
    case server(Int)

    var errorDescription: String? {
        switch self {
        case .missingURL: "Add your relay URL in Settings (e.g. https://media-remote-relay.you.workers.dev)."
        case .missingToken: "Add your token in Settings."
        case .unauthorized: "The relay rejected your token."
        case .noBrowser: "Chrome isn't connected to the relay."
        case .server(let code): "Relay error (HTTP \(code))."
        }
    }
}

struct RelayClient {
    let baseURL: URL
    let token: String

    static let urlKey = "relayURL"

    /// Builds a client from the saved settings (URL in UserDefaults, token in the Keychain).
    static func fromSettings() throws -> RelayClient {
        guard let url = normalizedURL(UserDefaults.standard.string(forKey: urlKey) ?? "") else {
            throw RelayError.missingURL
        }
        guard let token = Keychain.token, !token.isEmpty else { throw RelayError.missingToken }
        return RelayClient(baseURL: url, token: token)
    }

    /// Accepts what people actually paste: stray whitespace, no scheme, a trailing slash.
    static func normalizedURL(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return nil }
        if !text.contains("://") { text = "https://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), url.host() != nil else { return nil }
        return url
    }

    func status() async throws -> RelayStatus {
        let (data, _) = try await perform(request(path: "status"))
        return try JSONDecoder().decode(RelayStatus.self, from: data)
    }

    func send(_ action: RelayAction) async throws {
        var req = request(path: "command")
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["action": action.rawValue])
        _ = try await perform(req)
    }

    private func request(path: String) -> URLRequest {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 10
        return req
    }

    private func perform(_ req: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw RelayError.server(0) }
        switch http.statusCode {
        case 200..<300: return (data, http)
        case 401: throw RelayError.unauthorized
        case 503: throw RelayError.noBrowser
        default: throw RelayError.server(http.statusCode)
        }
    }
}
