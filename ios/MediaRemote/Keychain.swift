import Foundation
import Security

/// Stores the relay token in the Keychain. Readable after first unlock so the
/// Shortcuts / Siri / Action button intent works while the phone is locked.
enum Keychain {
    private static let service = "MediaRemote"
    private static let account = "relayToken"

    static var token: String? {
        get {
            var query = baseQuery
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            var item: CFTypeRef?
            guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
                  let data = item as? Data
            else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            SecItemDelete(baseQuery as CFDictionary)
            guard let newValue = newValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !newValue.isEmpty
            else { return }
            var query = baseQuery
            query[kSecValueData as String] = Data(newValue.utf8)
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(query as CFDictionary, nil)
        }
    }

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
