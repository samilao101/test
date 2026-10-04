import Foundation
import Observation

@MainActor
@Observable
final class RemoteModel {
    private(set) var status: RelayStatus?
    private(set) var error: String?
    private(set) var isSending = false
    private(set) var liveActivityOn = MediaActivity.isRunning

    var isPlaying: Bool { status?.state?.playing ?? false }
    var browserConnected: Bool { (status?.connected ?? 0) > 0 }
    var playingTabs: [MediaTab] { status?.state?.tabs ?? [] }

    var isConfigured: Bool { (try? RelayClient.fromSettings()) != nil }

    func refresh() async {
        do {
            let status = try await RelayClient.fromSettings().status()
            self.status = status
            error = nil
            await MediaActivity.update(with: status)
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

    func setLiveActivity(_ on: Bool) async {
        if on {
            guard MediaActivity.isAllowed else {
                error = "Turn on Live Activities for Media Remote in the Settings app."
                return
            }
            do {
                try MediaActivity.start(with: status)
            } catch {
                self.error = error.localizedDescription
            }
        } else {
            await MediaActivity.end()
        }
        liveActivityOn = MediaActivity.isRunning
    }

    /// Polls while the app is in the foreground; cancelled when the view's task ends.
    func poll() async {
        while !Task.isCancelled {
            // The system can end the activity (e.g. after 8 hours or a swipe away).
            liveActivityOn = MediaActivity.isRunning
            await refresh()
            try? await Task.sleep(for: .seconds(3))
        }
    }
}
