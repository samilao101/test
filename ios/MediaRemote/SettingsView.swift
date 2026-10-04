import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(RelayClient.urlKey) private var relayURL = ""
    @State private var token = Keychain.token ?? ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://media-remote-relay.you.workers.dev", text: $relayURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Relay URL")
                } footer: {
                    if !relayURL.isEmpty && RelayClient.normalizedURL(relayURL) == nil {
                        Text("That doesn't look like a valid URL.").foregroundStyle(.red)
                    }
                }
                Section {
                    SecureField("Token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Token")
                } footer: {
                    Text("The same AUTH_TOKEN you set on the Cloudflare Worker and in the Chrome extension.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            // Save as you type, so swiping the sheet away doesn't lose anything.
            .onChange(of: token) { _, newValue in Keychain.token = newValue }
        }
    }
}
