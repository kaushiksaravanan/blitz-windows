import SwiftUI

struct MacroControls: View {
    @Bindable var macroStore: MacroStore
    var onPlay: (Macro) -> Void

    @State private var macroName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Record controls
            HStack(spacing: 8) {
                if macroStore.isRecording {
                    HStack(spacing: 4) {
                        TextField("Macro name", text: $macroName)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 150)
                        Button("Save") {
                            // macroService.stopRecording handled externally
                        }
                        .disabled(macroName.isEmpty)
                    }
                } else {
                    Button(action: {
                        macroStore.isRecording = true
                    }) {
                        Label("Record", systemImage: "record.circle")
                    }
                }

                if macroStore.isPlaying {
                    ProgressView()
                        .scaleEffect(0.6)
                    Text("Playing...")
                        .font(.system(size: 11))
                }
            }

            // Macro list
            if !macroStore.macros.isEmpty {
                Divider()
                ForEach(macroStore.macros) { macro in
                    HStack {
                        Text(macro.name)
                            .font(.system(size: 12))
                        Text("\(macro.actions.count) actions")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button(action: { onPlay(macro) }) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 10))
                        }
                        .disabled(macroStore.isPlaying)
                    }
                }
            }
        }
        .padding(8)
    }
}
