import SwiftUI

struct ConnectAIPopover: View {
    let projectPath: String?

    @State private var copied = false

    private var command: String {
        guard let path = projectPath else { return "claude" }
        return "cd \(path) && claude"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect AI")
                .font(.headline)

            // Agent type selector (only Claude Code for now)
            Picker("Agent", selection: .constant("claude-code")) {
                Text("Claude Code").tag("claude-code")
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            HStack(spacing: 8) {
                Text(command)
                    .font(.system(size: 12, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))

                Button(action: {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(command, forType: .string)
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                }) {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                }
                .help("Copy to clipboard")
            }

            Text("Run this in your terminal to connect Claude Code to this project.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(width: 360)
    }
}
