import AppIntents
import Foundation

/// Toggles playback. Used by the Live Activity button, Shortcuts, Siri, the
/// Action button and Back Tap. As a LiveActivityIntent it runs in the app's
/// process (launched in the background if needed), without opening the app.
struct ToggleMediaIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Toggle Chrome Playback"
    static let description = IntentDescription("Pauses or resumes audio and video playing in Chrome on your computer.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        let client = try RelayClient.fromSettings()
        try await client.send(.toggle)
        // Give the extension a moment to act and report back, then refresh the Live Activity.
        try? await Task.sleep(for: .milliseconds(800))
        #if !WIDGET_EXTENSION
        if let status = try? await client.status() {
            await MediaActivity.update(with: status)
        }
        #endif
        return .result()
    }
}
