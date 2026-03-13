import SwiftUI

/// Compact update banner shown in WelcomeWindow and SettingsView.
struct UpdateBanner: View {
    @Bindable var autoUpdate: AutoUpdateManager

    var body: some View {
        switch autoUpdate.state {
        case .idle, .checking:
            EmptyView()

        case .available(let version, let notes):
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "arrow.down.circle.fill")
                        .foregroundStyle(.blue)
                    Text("Update Available")
                        .font(.headline)
                    Spacer()
                    Text("v\(version)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }

                HStack {
                    Button("Update Now") {
                        Task { await autoUpdate.performUpdate() }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)

                    Button("Later") {
                        autoUpdate.dismiss()
                    }
                    .controlSize(.small)
                }
            }
            .padding(12)
            .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.blue.opacity(0.2), lineWidth: 1))
            .padding(.top, 8)

        case .downloading(let percent):
            VStack(spacing: 6) {
                HStack {
                    Text("Downloading update...")
                        .font(.caption)
                    Spacer()
                    Text("\(percent)%")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: Double(percent), total: 100)
                    .progressViewStyle(.linear)
            }
            .padding(12)
            .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            .padding(.top, 8)

        case .installing:
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text("Installing update...")
                    .font(.caption)
            }
            .padding(12)
            .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            .padding(.top, 8)

        case .failed(let message):
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text("Update failed")
                        .font(.caption.weight(.medium))
                }
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                Button("Retry") {
                    Task { await autoUpdate.performUpdate() }
                }
                .controlSize(.small)
            }
            .padding(12)
            .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            .padding(.top, 8)
        }
    }
}
