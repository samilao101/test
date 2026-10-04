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
