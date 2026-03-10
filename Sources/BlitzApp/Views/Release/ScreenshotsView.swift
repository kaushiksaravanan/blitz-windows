import SwiftUI

struct ScreenshotsView: View {
    var appState: AppState

    private var asc: ASCManager { appState.ascManager }
    @State private var selectedSetId: String = ""

    var body: some View {
        ASCCredentialGate(
            ascManager: asc,
            projectId: appState.activeProjectId ?? "",
            bundleId: appState.activeProject?.metadata.bundleIdentifier
        ) {
            ASCTabContent(asc: asc, tab: .screenshots) {
                screenshotsContent
            }
        }
        .task { await asc.fetchTabData(.screenshots) }
    }

    @ViewBuilder
    private var screenshotsContent: some View {
        let sets = asc.screenshotSets
        let currentSet = sets.first { $0.id == selectedSetId } ?? sets.first
        let shots = currentSet.flatMap { asc.screenshots[$0.id] } ?? []

        VStack(spacing: 0) {
            // Device type picker
            if !sets.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(sets) { set in
                            Button {
                                selectedSetId = set.id
                            } label: {
                                Text(deviceLabel(set.attributes.screenshotDisplayType))
                                    .font(.callout)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                            .background(
                                selectedSetId == set.id || (selectedSetId.isEmpty && set.id == sets.first?.id)
                                    ? Color.accentColor.opacity(0.2)
                                    : Color.clear
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(
                                        selectedSetId == set.id || (selectedSetId.isEmpty && set.id == sets.first?.id)
                                            ? Color.accentColor
                                            : Color.clear,
                                        lineWidth: 1
                                    )
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                }
                .background(.background.secondary)
                Divider()
            }

            if shots.isEmpty && !sets.isEmpty {
                ContentUnavailableView(
                    "No Screenshots",
                    systemImage: "photo.on.rectangle",
                    description: Text("No screenshots uploaded for this device type.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if sets.isEmpty {
                ContentUnavailableView(
                    "No Screenshots",
                    systemImage: "photo.on.rectangle",
                    description: Text("Upload screenshots in App Store Connect.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 160, maximum: 220))],
                        spacing: 16
                    ) {
                        ForEach(shots) { shot in
                            screenshotTile(shot)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .onAppear {
            if selectedSetId.isEmpty, let first = sets.first {
                selectedSetId = first.id
            }
        }
        .onChange(of: sets.count) { _, _ in
            if selectedSetId.isEmpty, let first = asc.screenshotSets.first {
                selectedSetId = first.id
            }
        }
    }

    private func screenshotTile(_ shot: ASCScreenshot) -> some View {
        VStack(spacing: 6) {
            Group {
                if let url = shot.imageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fit)
                        case .failure:
                            Image(systemName: "photo").font(.title).foregroundStyle(.secondary)
                        default:
                            ProgressView()
                        }
                    }
                } else {
                    Image(systemName: "photo")
                        .font(.title)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(height: 200)
            .frame(maxWidth: .infinity)
            .background(.background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            if let name = shot.attributes.fileName {
                Text(name)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            if let state = shot.attributes.assetDeliveryState?.state {
                Text(state)
                    .font(.caption2)
                    .foregroundStyle(state == "COMPLETE" ? .green : .orange)
            }
        }
    }

    private func deviceLabel(_ type: String) -> String {
        // Convert APP_IPHONE_67 → iPhone 6.7"
        let cleaned = type
            .replacingOccurrences(of: "APP_IPHONE_", with: "iPhone ")
            .replacingOccurrences(of: "APP_IPAD_", with: "iPad ")
            .replacingOccurrences(of: "APP_WATCH_", with: "Watch ")
            .replacingOccurrences(of: "APP_TV_", with: "Apple TV ")
        // Insert decimal if needed: "67" → "6.7"
        if let range = cleaned.range(of: #"(\d{2})$"#, options: .regularExpression) {
            let digits = String(cleaned[range])
            let decimal = digits.dropLast() + "." + digits.suffix(1)
            return cleaned.replacingCharacters(in: range, with: decimal + "\"")
        }
        return cleaned
    }
}
