import ActivityKit
import Foundation

struct MediaActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var playing: Bool
        var connected: Bool
        var title: String
    }
}

/// Starts, updates and ends the Live Activity shown in the Dynamic Island and on the Lock Screen.
/// The widget extension compiles this file only for the attributes type (ActivityKit's
/// request/update/end are app-only), so the manager is compiled out there.
#if !WIDGET_EXTENSION
enum MediaActivity {
    static var isRunning: Bool { !Activity<MediaActivityAttributes>.activities.isEmpty }

    static var isAllowed: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    static func start(with status: RelayStatus?) throws {
        guard !isRunning else { return }
        let state = contentState(from: status)
        _ = try Activity.request(
            attributes: MediaActivityAttributes(),
            content: ActivityContent(state: state, staleDate: nil),
            pushType: nil
        )
    }

    static func update(with status: RelayStatus) async {
        for activity in Activity<MediaActivityAttributes>.activities {
            var state = contentState(from: status)
            // Nothing is playing while paused, so keep showing what was playing last.
            if state.title.isEmpty { state.title = activity.content.state.title }
            guard state != activity.content.state else { continue }
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    static func end() async {
        for activity in Activity<MediaActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    private static func contentState(from status: RelayStatus?) -> MediaActivityAttributes.ContentState {
        let title = status?.state?.tabs.first.map { displayTitle($0) } ?? ""
        return .init(
            playing: status?.state?.playing ?? false,
            connected: (status?.connected ?? 0) > 0,
            title: title
        )
    }

    /// "(61) Some Talk - YouTube" -> "Some Talk"
    private static func displayTitle(_ tab: MediaTab) -> String {
        var title = tab.title.isEmpty ? (URL(string: tab.url)?.host() ?? tab.url) : tab.title
        if let range = title.range(of: #"^\(\d+\)\s*"#, options: .regularExpression) {
            title.removeSubrange(range)
        }
        for suffix in [" - YouTube", " | Spotify", " - SoundCloud"] where title.hasSuffix(suffix) {
            title.removeLast(suffix.count)
        }
        return title
    }
}
#endif
