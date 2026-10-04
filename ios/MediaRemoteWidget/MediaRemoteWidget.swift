import AppIntents
import SwiftUI
import WidgetKit

@main
struct MediaRemoteWidgetBundle: WidgetBundle {
    var body: some Widget {
        MediaLiveActivity()
    }
}

struct MediaLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MediaActivityAttributes.self) { context in
            // Lock Screen / notification banner
            HStack(spacing: 12) {
                Image(systemName: "music.note")
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.title.isEmpty ? "Chrome" : context.state.title)
                        .font(.headline)
                        .lineLimit(1)
                    Text(subtitle(context.state))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                ToggleButton(playing: context.state.playing, size: 44)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.6))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "music.note")
                        .font(.title2)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ToggleButton(playing: context.state.playing, size: 44)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(context.state.title.isEmpty ? "Chrome" : context.state.title)
                            .font(.headline)
                            .lineLimit(1)
                        Text(subtitle(context.state))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "music.note")
            } compactTrailing: {
                Image(systemName: context.state.playing ? "pause.fill" : "play.fill")
            } minimal: {
                Image(systemName: context.state.playing ? "pause.fill" : "play.fill")
            }
        }
    }

    private func subtitle(_ state: MediaActivityAttributes.ContentState) -> String {
        if !state.connected { return "Chrome offline" }
        return state.playing ? "Playing in Chrome" : "Paused"
    }
}

private struct ToggleButton: View {
    let playing: Bool
    let size: CGFloat

    var body: some View {
        Button(intent: ToggleMediaIntent()) {
            Image(systemName: playing ? "pause.fill" : "play.fill")
                .font(.system(size: size * 0.45, weight: .semibold))
                .frame(width: size, height: size)
                .background(Circle().fill(.white.opacity(0.2)))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }
}
