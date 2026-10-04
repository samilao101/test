import Foundation
import Observation

@MainActor
@Observable
final class RemoteModel {
    private(set) var status: RelayStatus?
    private(set) var error: String?
    private(set) var isSending = false

    var isPlaying: Bool { status?.state?.playing ?? false }
    var browserConnected: Bool { (status?.connected ?? 0) > 0 }
    var playingTabs: [MediaTab] { status?.state?.tabs ?? [] }

    var isConfigured: Bool { (try? RelayClient.fromSettings()) != nil }

    func refresh() async {
        do {
            status = try await RelayClient.fromSettings().status()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func send(_ action: RelayAction) async {
        isSending = true
        defer { isSending = false }
        do {
            try await RelayClient.fromSettings().send(action)
            error = nil
            // Give the extension a moment to act and report back.
            try? await Task.sleep(for: .milliseconds(700))
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Polls while the app is in the foreground; cancelled when the view's task ends.
    func poll() async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(for: .seconds(3))
        }
    }
}
