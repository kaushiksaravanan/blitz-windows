import SwiftUI

struct IssueToolbar: View {
    @Bindable var issueStore: IssueStore
    @State private var showNewIssue = false
    @State private var newIssueTitle = ""
    @State private var isExpanded = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button(action: { isExpanded.toggle() }) {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle")
                        Text("Issues")
                            .font(.system(size: 11, weight: .medium))
                        if issueStore.openCount > 0 {
                            Text("\(issueStore.openCount)")
                                .font(.system(size: 10, weight: .bold))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(.red)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    }
                }
                .buttonStyle(.plain)

                Spacer()

                Button(action: { showNewIssue = true }) {
                    Image(systemName: "plus")
                        .font(.system(size: 10))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)

            if isExpanded {
                Divider()
                if issueStore.issues.isEmpty {
                    Text("No issues")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .padding(8)
                } else {
                    ForEach(issueStore.issues) { issue in
                        HStack {
                            Circle()
                                .fill(issue.status == .open ? .red : .green)
                                .frame(width: 6, height: 6)
                            Text(issue.title)
                                .font(.system(size: 11))
                                .lineLimit(1)
                            Spacer()
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .background(.ultraThinMaterial)
        .popover(isPresented: $showNewIssue) {
            VStack(spacing: 8) {
                TextField("Issue title", text: $newIssueTitle)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Button("Cancel") { showNewIssue = false }
                    Spacer()
                    Button("Add") {
                        let issue = Issue(title: newIssueTitle)
                        issueStore.add(issue)
                        newIssueTitle = ""
                        showNewIssue = false
                    }
                    .disabled(newIssueTitle.isEmpty)
                }
            }
            .padding()
            .frame(width: 300)
        }
    }
}
