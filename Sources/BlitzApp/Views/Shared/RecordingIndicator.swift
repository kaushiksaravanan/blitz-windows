import SwiftUI

struct RecordingIndicator: View {
    let isRecording: Bool
    let duration: TimeInterval

    var body: some View {
        if isRecording {
            HStack(spacing: 6) {
                Circle()
                    .fill(.red)
                    .frame(width: 8, height: 8)
                    .opacity(pulseOpacity)

                Text(formatDuration(duration))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.red)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.red.opacity(0.1))
            .clipShape(Capsule())
        }
    }

    @State private var pulseOpacity: Double = 1.0

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
