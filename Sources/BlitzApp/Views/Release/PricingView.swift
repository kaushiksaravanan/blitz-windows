import SwiftUI

struct PricingView: View {
    var appState: AppState

    private var asc: ASCManager { appState.ascManager }
    @State private var isFree = true
    @State private var isSaving = false

    var body: some View {
        ASCCredentialGate(
            ascManager: asc,
            projectId: appState.activeProjectId ?? "",
            bundleId: appState.activeProject?.metadata.bundleIdentifier
        ) {
            ASCTabContent(asc: asc, tab: .pricing) {
                pricingContent
            }
        }
        .task { await asc.fetchTabData(.pricing) }
    }

    @ViewBuilder
    private var pricingContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Pricing")
                    .font(.title2.weight(.semibold))

                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Free App")
                                .font(.body.weight(.medium))
                            Text("Your app will be available for free on the App Store.")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Toggle("", isOn: $isFree)
                            .labelsHidden()
                            .onChange(of: isFree) { _, newValue in
                                if newValue {
                                    isSaving = true
                                    Task {
                                        await asc.setPriceFree()
                                        isSaving = false
                                    }
                                }
                            }
                    }

                    if isSaving {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Saving…").font(.callout).foregroundStyle(.secondary)
                        }
                    }

                    Divider()

                    Text("Paid pricing tiers are not yet supported. To set a paid price, use App Store Connect directly.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(.background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .padding(24)
        }
    }
}
