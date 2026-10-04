import SwiftUI

struct ContentView: View {
    @State private var model = RemoteModel()
    @State private var showSettings = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                Button {
                    Task { await model.send(.toggle) }
                } label: {
                    Image(systemName: model.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 72, weight: .semibold))
                        .frame(width: 180, height: 180)
                        .background(Circle().fill(.tint))
                        .foregroundStyle(.white)
                        .contentTransition(.symbolEffect(.replace))
                }
                .disabled(model.isSending || !model.isConfigured)
                .sensoryFeedback(.impact, trigger: model.isSending) { _, sending in sending }
                .accessibilityLabel(model.isPlaying ? "Pause" : "Play")

                nowPlaying

                Spacer()

                Toggle("Show in Dynamic Island", isOn: Binding(
                    get: { model.liveActivityOn },
                    set: { on in Task { await model.setLiveActivity(on) } }
                ))
                .disabled(!model.isConfigured)

                connectionLabel
            }
            .padding()
            .navigationTitle("Media Remote")
            .toolbar {
                Button("Settings", systemImage: "gearshape") { showSettings = true }
            }
            .sheet(isPresented: $showSettings, onDismiss: { Task { await model.refresh() } }) {
                SettingsView()
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            if !model.isConfigured { showSettings = true }
            await model.poll()
        }
    }

    @ViewBuilder
    private var nowPlaying: some View {
        if let error = model.error {
            Text(error)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
        } else if model.playingTabs.isEmpty {
            Text(model.browserConnected ? "Nothing playing" : " ")
                .foregroundStyle(.secondary)
        } else {
            VStack(spacing: 6) {
                ForEach(model.playingTabs, id: \.self) { tab in
                    Text(tab.title.isEmpty ? tab.url : tab.title)
                        .lineLimit(1)
                }
            }
            .font(.headline)
        }
    }

    private var connectionLabel: some View {
        Label(
            model.browserConnected ? "Chrome connected" : "Chrome offline",
            systemImage: model.browserConnected ? "checkmark.circle.fill" : "xmark.circle"
        )
        .font(.footnote)
        .foregroundStyle(model.browserConnected ? .green : .secondary)
    }
}
