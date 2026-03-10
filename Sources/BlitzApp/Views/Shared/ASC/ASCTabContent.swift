import SwiftUI

/// Wraps a tab's content with loading, error, and empty-app states.
struct ASCTabContent<Content: View>: View {
    var asc: ASCManager
    var tab: AppTab
    @ViewBuilder var content: () -> Content

    var body: some View {
        if asc.isLoadingTab[tab] == true {
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading…")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = asc.tabError[tab] {
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 32))
                    .foregroundStyle(.orange)
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 360)

                if asc.app == nil {
                    Text("Create your app in App Store Connect, then set the bundle ID in Settings \u{2192} Project.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 360)

                    Link("Open App Store Connect",
                         destination: URL(string: "https://appstoreconnect.apple.com/apps")!)
                        .font(.callout)
                }

                Button("Retry") {
                    Task { await asc.refreshTabData(tab) }
                }
                .buttonStyle(.bordered)
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            content()
        }
    }
}

/// Reusable info row for detail views.
struct InfoRow: View {
    var label: String
    var value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(width: 150, alignment: .leading)
            Text(value)
                .font(.callout)
                .textSelection(.enabled)
            Spacer()
        }
        .padding(.vertical, 6)
    }
}

/// Formats an ISO 8601 date string for display.
func ascShortDate(_ iso: String) -> String {
    let f1 = ISO8601DateFormatter()
    f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let f2 = ISO8601DateFormatter()
    if let d = f1.date(from: iso) ?? f2.date(from: iso) {
        return d.formatted(date: .abbreviated, time: .omitted)
    }
    return iso
}

/// Formats an ISO 8601 date string with time.
func ascLongDate(_ iso: String) -> String {
    let f1 = ISO8601DateFormatter()
    f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let f2 = ISO8601DateFormatter()
    if let d = f1.date(from: iso) ?? f2.date(from: iso) {
        return d.formatted(date: .abbreviated, time: .shortened)
    }
    return iso
}
