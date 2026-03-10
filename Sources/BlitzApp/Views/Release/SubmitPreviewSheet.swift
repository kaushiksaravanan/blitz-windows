import SwiftUI

struct SubmitPreviewSheet: View {
    var appState: AppState
    @Environment(\.dismiss) private var dismiss

    private var asc: ASCManager { appState.ascManager }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Submit for Review")
                .font(.title2.weight(.semibold))

            HStack(alignment: .top, spacing: 20) {
                // App icon placeholder
                RoundedRectangle(cornerRadius: 22)
                    .fill(.blue.gradient)
                    .frame(width: 100, height: 100)
                    .overlay(
                        Image(systemName: "app.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(.white)
                    )

                VStack(alignment: .leading, spacing: 6) {
                    Text(asc.app?.name ?? "App")
                        .font(.title3.weight(.semibold))
                    if let version = asc.appStoreVersions.first {
                        Text("Version \(version.attributes.versionString)")
                            .foregroundStyle(.secondary)
                    }
                    Text(asc.app?.bundleId ?? "")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                    if let desc = asc.localizations.first?.attributes.description {
                        Text(desc)
                            .lineLimit(3)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .padding(.top, 4)
                    }
                }
            }

            Divider()

            // Readiness check
            let readiness = asc.submissionReadiness
            if !readiness.missingRequired.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Missing Required Fields")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(.red)
                    ForEach(readiness.missingRequired) { field in
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundStyle(.red)
                                .font(.caption)
                            Text(field.label)
                                .font(.callout)
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if asc.isSubmitting {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Submitting for review…")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .center)
            }

            if let error = asc.submissionError {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .padding(8)
                    .background(Color.red.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Submit for Review") {
                    Task {
                        await asc.submitForReview()
                        if asc.submissionError == nil {
                            dismiss()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(asc.isSubmitting || !readiness.isComplete)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 480)
    }
}
