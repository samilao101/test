import AppIntents
import SwiftUI

@main
struct MediaRemoteApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/// Lets Shortcuts, Siri, the Action button and Back Tap toggle playback
/// without opening the app.
struct ToggleMediaIntent: AppIntent {
    static let title: LocalizedStringResource = "Toggle Chrome Playback"
    static let description = IntentDescription("Pauses or resumes audio and video playing in Chrome on your computer.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        try await RelayClient.fromSettings().send(.toggle)
        return .result()
    }
}

struct MediaRemoteShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ToggleMediaIntent(),
            phrases: ["Toggle playback in \(.applicationName)", "Pause \(.applicationName)"],
            shortTitle: "Play/Pause",
            systemImageName: "playpause.fill"
        )
    }
}
