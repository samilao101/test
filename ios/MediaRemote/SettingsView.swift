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
                }
                Section {
                    SecureField("Token", text: $token)
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
                    Button("Done") {
                        relayURL = relayURL.trimmingCharacters(in: .whitespaces)
                        Keychain.token = token.trimmingCharacters(in: .whitespaces)
                        dismiss()
                    }
                }
            }
        }
    }
}
