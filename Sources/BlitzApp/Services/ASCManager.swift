import Foundation

@MainActor
@Observable
final class ASCManager {
    nonisolated init() {}

    // Credentials & service
    var credentials: ASCCredentials?
    private(set) var service: AppStoreConnectService?

    // App
    var app: ASCApp?

    // Loading / error state
    var isLoadingCredentials = false
    var credentialsError: String?
    var isLoadingApp = false

    // Per-tab data
    var appStoreVersions: [ASCAppStoreVersion] = []
    var localizations: [ASCVersionLocalization] = []
    var screenshotSets: [ASCScreenshotSet] = []
    var screenshots: [String: [ASCScreenshot]] = [:]  // keyed by screenshotSet.id
    var customerReviews: [ASCCustomerReview] = []
    var builds: [ASCBuild] = []
    var betaGroups: [ASCBetaGroup] = []
    var betaLocalizations: [ASCBetaLocalization] = []
    var betaFeedback: [String: [ASCBetaFeedback]] = [:]  // keyed by build.id
    var selectedBuildId: String?

    // New data for submission flow
    var appInfo: ASCAppInfo?
    var appInfoLocalization: ASCAppInfoLocalization?
    var ageRatingDeclaration: ASCAgeRatingDeclaration?
    var reviewDetail: ASCReviewDetail?
    var pendingFormValues: [String: [String: String]] = [:]  // tab → field → value (for MCP pre-fill)
    var pendingFormVersion: Int = 0  // Incremented when pendingFormValues changes; views watch this
    var showSubmitPreview = false
    var isSubmitting = false
    var submissionError: String?
    var writeError: String?  // Inline error for write operations (does not replace tab content)

    // App icon status (set externally; nil = not checked / missing)
    var appIconStatus: String?

    // Pricing status (set after pricing check or setPriceFree success)
    var pricingStatus: String?

    // Build pipeline progress (driven by MCPToolExecutor)
    enum BuildPipelinePhase: String {
        case idle
        case signingSetup = "Setting up signing…"
        case archiving = "Archiving…"
        case exporting = "Exporting IPA…"
        case uploading = "Uploading to App Store Connect…"
        case processing = "Processing build…"
    }
    var buildPipelinePhase: BuildPipelinePhase = .idle
    var buildPipelineMessage: String = ""  // Latest progress line from the build

    var submissionReadiness: SubmissionReadiness {
        let loc = localizations.first
        let info = appInfoLocalization
        let review = reviewDetail
        let demoRequired = review?.attributes.demoAccountRequired == true
        let version = appStoreVersions.first

        // Screenshot checks per display type
        let iphoneScreenshots = screenshotSets.first { $0.attributes.screenshotDisplayType == "APP_IPHONE_67" }
        let ipadScreenshots = screenshotSets.first { $0.attributes.screenshotDisplayType == "APP_IPAD_PRO_3GEN_129" }

        // Privacy nutrition labels URL (manual action required)
        let privacyUrl: String? = app.map {
            "https://appstoreconnect.apple.com/apps/\($0.id)/distribution/privacy"
        }

        var fields: [SubmissionReadiness.FieldStatus] = [
            .init(label: "App Name", value: info?.attributes.name ?? loc?.attributes.title),
            .init(label: "Description", value: loc?.attributes.description),
            .init(label: "Keywords", value: loc?.attributes.keywords),
            .init(label: "Support URL", value: loc?.attributes.supportUrl),
            .init(label: "Privacy Policy URL", value: info?.attributes.privacyPolicyUrl),
            .init(label: "Copyright", value: version?.attributes.copyright),
            .init(label: "Content Rights", value: app?.contentRightsDeclaration),
            .init(label: "Primary Category", value: appInfo?.primaryCategoryId),
            .init(label: "Age Rating", value: ageRatingDeclaration != nil ? "Configured" : nil),
            .init(label: "Pricing", value: pricingStatus),
            .init(label: "Review Contact First Name", value: review?.attributes.contactFirstName),
            .init(label: "Review Contact Last Name", value: review?.attributes.contactLastName),
            .init(label: "Review Contact Email", value: review?.attributes.contactEmail),
            .init(label: "Review Contact Phone", value: review?.attributes.contactPhone),
        ]

        // Conditional: demo credentials required when demoAccountRequired is set
        if demoRequired {
            fields.append(.init(label: "Demo Account Name", value: review?.attributes.demoAccountName))
            fields.append(.init(label: "Demo Account Password", value: review?.attributes.demoAccountPassword))
        }

        fields.append(contentsOf: [
            .init(label: "App Icon", value: appIconStatus),
            .init(label: "iPhone Screenshots", value: iphoneScreenshots != nil ? "\(iphoneScreenshots!.attributes.screenshotCount ?? 0) screenshot(s)" : nil),
            .init(label: "iPad Screenshots", value: ipadScreenshots != nil ? "\(ipadScreenshots!.attributes.screenshotCount ?? 0) screenshot(s)" : nil),
            .init(label: "Privacy Nutrition Labels", value: nil, required: false, actionUrl: privacyUrl),
            .init(label: "Build", value: builds.first?.attributes.version),
        ])

        return SubmissionReadiness(fields: fields)
    }

    // Per-tab loading / error
    var isLoadingTab: [AppTab: Bool] = [:]
    var tabError: [AppTab: String] = [:]
    private var loadedTabs: Set<AppTab> = []

    var loadedProjectId: String?

    // MARK: - App Icon Check

    /// Check whether the project has app icon assets at ~/.blitz/projects/{projectId}/assets/AppIcon/
    func checkAppIcon(projectId: String) {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        let iconDir = "\(home)/.blitz/projects/\(projectId)/assets/AppIcon"
        let icon1024 = "\(iconDir)/icon_1024.png"

        if fm.fileExists(atPath: icon1024) {
            appIconStatus = "1024px"
        } else {
            // Also check the Xcode project's xcassets as fallback
            let projectDir = "\(home)/.blitz/projects/\(projectId)"
            let xcassetsPattern = ["ios", "macos", "."]
            for subdir in xcassetsPattern {
                let searchDir = subdir == "." ? projectDir : "\(projectDir)/\(subdir)"
                if let enumerator = fm.enumerator(atPath: searchDir) {
                    while let file = enumerator.nextObject() as? String {
                        if file.hasSuffix("AppIcon.appiconset/Contents.json") {
                            let contentsPath = "\(searchDir)/\(file)"
                            if let data = fm.contents(atPath: contentsPath),
                               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                               let images = json["images"] as? [[String: Any]] {
                                let hasFilename = images.contains { $0["filename"] != nil }
                                if hasFilename {
                                    appIconStatus = "Configured"
                                    return
                                }
                            }
                        }
                    }
                }
            }
            appIconStatus = nil
        }
    }

    // MARK: - Project Lifecycle

    func loadCredentials(for projectId: String, bundleId: String?) async {
        guard loadedProjectId != projectId else { return }

        isLoadingCredentials = true
        credentialsError = nil

        let creds = ASCCredentials.load()

        credentials = creds
        isLoadingCredentials = false
        loadedProjectId = projectId

        if let creds {
            service = AppStoreConnectService(credentials: creds)
        }

        if let bundleId, !bundleId.isEmpty, creds != nil {
            await fetchApp(bundleId: bundleId)
        }
    }

    func clearForProjectSwitch() {
        credentials = nil
        service = nil
        app = nil
        isLoadingCredentials = false
        credentialsError = nil
        isLoadingApp = false
        appStoreVersions = []
        localizations = []
        screenshotSets = []
        screenshots = [:]
        customerReviews = []
        builds = []
        betaGroups = []
        betaLocalizations = []
        betaFeedback = [:]
        selectedBuildId = nil
        appInfo = nil
        appInfoLocalization = nil
        ageRatingDeclaration = nil
        reviewDetail = nil
        pendingFormValues = [:]
        showSubmitPreview = false
        isSubmitting = false
        submissionError = nil
        writeError = nil
        appIconStatus = nil
        pricingStatus = nil
        isLoadingTab = [:]
        tabError = [:]
        loadedTabs = []
        loadedProjectId = nil
    }

    func saveCredentials(_ creds: ASCCredentials, projectId: String, bundleId: String?) async throws {
        try creds.save()
        credentials = creds
        service = AppStoreConnectService(credentials: creds)
        credentialsError = nil
        loadedTabs = []  // force re-fetch after new credentials

        if let bundleId, !bundleId.isEmpty {
            await fetchApp(bundleId: bundleId)
        }
    }

    func deleteCredentials(projectId: String) {
        ASCCredentials.delete()
        let pid = loadedProjectId
        clearForProjectSwitch()
        loadedProjectId = pid  // keep project id so gate re-checks correctly
    }

    // MARK: - App Fetch

    func fetchApp(bundleId: String) async {
        guard let service else { return }
        isLoadingApp = true
        do {
            let fetched = try await service.fetchApp(bundleId: bundleId)
            app = fetched
        } catch {
            credentialsError = error.localizedDescription
        }
        isLoadingApp = false
    }

    // MARK: - Tab Data

    func fetchTabData(_ tab: AppTab) async {
        guard let service else { return }
        guard credentials != nil else { return }
        guard !loadedTabs.contains(tab) else { return }
        guard isLoadingTab[tab] != true else { return }

        isLoadingTab[tab] = true
        tabError.removeValue(forKey: tab)

        do {
            try await loadData(for: tab, service: service)
            isLoadingTab[tab] = false
            loadedTabs.insert(tab)
        } catch {
            isLoadingTab[tab] = false
            tabError[tab] = error.localizedDescription
        }
    }

    func refreshTabData(_ tab: AppTab) async {
        guard let service else { return }
        guard credentials != nil else { return }

        loadedTabs.remove(tab)
        isLoadingTab[tab] = true
        tabError.removeValue(forKey: tab)

        do {
            try await loadData(for: tab, service: service)
            isLoadingTab[tab] = false
            loadedTabs.insert(tab)
        } catch {
            isLoadingTab[tab] = false
            tabError[tab] = error.localizedDescription
        }
    }

    private func loadData(for tab: AppTab, service: AppStoreConnectService) async throws {
        guard let appId = app?.id else {
            throw ASCError.notFound("App — check your bundle ID in project settings")
        }

        switch tab {
        case .ascOverview:
            let versions = try await service.fetchAppStoreVersions(appId: appId)
            appStoreVersions = versions
            // Fetch all data needed for submission readiness
            if let latestId = versions.first?.id {
                localizations = try await service.fetchLocalizations(versionId: latestId)
                ageRatingDeclaration = try? await service.fetchAgeRating(versionId: latestId)
                reviewDetail = try? await service.fetchReviewDetail(versionId: latestId)
                let locs = localizations
                if let firstLocId = locs.first?.id {
                    screenshotSets = try await service.fetchScreenshotSets(localizationId: firstLocId)
                }
            }
            appInfo = try? await service.fetchAppInfo(appId: appId)
            if let infoId = appInfo?.id {
                appInfoLocalization = try? await service.fetchAppInfoLocalization(appInfoId: infoId)
            }
            builds = try await service.fetchBuilds(appId: appId)

            // Check pricing status
            let hasPricing = await service.fetchPricingConfigured(appId: appId)
            pricingStatus = hasPricing ? "Configured" : nil

        case .storeListing:
            let versions = try await service.fetchAppStoreVersions(appId: appId)
            appStoreVersions = versions
            if let latestId = versions.first?.id {
                localizations = try await service.fetchLocalizations(versionId: latestId)
            }
            // Also fetch appInfoLocalization for privacy policy URL
            if appInfo == nil {
                appInfo = try? await service.fetchAppInfo(appId: appId)
            }
            if let infoId = appInfo?.id, appInfoLocalization == nil {
                appInfoLocalization = try? await service.fetchAppInfoLocalization(appInfoId: infoId)
            }

        case .screenshots:
            let versions = try await service.fetchAppStoreVersions(appId: appId)
            appStoreVersions = versions
            if let latestId = versions.first?.id {
                let locs = try await service.fetchLocalizations(versionId: latestId)
                localizations = locs
                if let firstLocId = locs.first?.id {
                    let sets = try await service.fetchScreenshotSets(localizationId: firstLocId)
                    screenshotSets = sets
                    for set in sets {
                        let shots = try await service.fetchScreenshots(setId: set.id)
                        screenshots[set.id] = shots
                    }
                }
            }

        case .appDetails:
            let versions = try await service.fetchAppStoreVersions(appId: appId)
            appStoreVersions = versions
            appInfo = try? await service.fetchAppInfo(appId: appId)

        case .review:
            let versions = try await service.fetchAppStoreVersions(appId: appId)
            appStoreVersions = versions
            if let latestId = versions.first?.id {
                ageRatingDeclaration = try? await service.fetchAgeRating(versionId: latestId)
                reviewDetail = try? await service.fetchReviewDetail(versionId: latestId)
            }
            builds = try await service.fetchBuilds(appId: appId)

        case .pricing:
            break  // Pricing is fetched on demand

        case .analytics:
            break  // Sales reports use a separate reports API; handled in view

        case .reviews:
            customerReviews = try await service.fetchCustomerReviews(appId: appId)

        case .builds:
            builds = try await service.fetchBuilds(appId: appId)

        case .groups:
            betaGroups = try await service.fetchBetaGroups(appId: appId)

        case .betaInfo:
            betaLocalizations = try await service.fetchBetaLocalizations(appId: appId)

        case .feedback:
            let fetched = try await service.fetchBuilds(appId: appId)
            builds = fetched
            if let first = fetched.first {
                selectedBuildId = first.id
                do {
                    betaFeedback[first.id] = try await service.fetchBetaFeedback(buildId: first.id)
                } catch {
                    // Feedback may not be available for all apps; non-fatal
                    betaFeedback[first.id] = []
                }
            }

        default:
            break
        }
    }

    // MARK: - Write Methods

    func updateLocalizationField(_ field: String, value: String, locId: String) async {
        guard let service else { return }
        writeError = nil
        do {
            try await service.patchLocalization(id: locId, fields: [field: value])
            if let latestId = appStoreVersions.first?.id {
                localizations = try await service.fetchLocalizations(versionId: latestId)
            }
        } catch {
            writeError = error.localizedDescription
        }
    }

    func updatePrivacyPolicyUrl(_ url: String) async {
        await updateAppInfoLocalizationField("privacyPolicyUrl", value: url)
    }

    /// Update a field on appInfoLocalizations (name, subtitle, privacyPolicyUrl)
    func updateAppInfoLocalizationField(_ field: String, value: String) async {
        guard let service else { return }
        guard let locId = appInfoLocalization?.id else { return }
        writeError = nil
        // Map UI field names to API field names
        let apiField = (field == "title") ? "name" : field
        do {
            try await service.patchAppInfoLocalization(id: locId, fields: [apiField: value])
            if let infoId = appInfo?.id {
                appInfoLocalization = try? await service.fetchAppInfoLocalization(appInfoId: infoId)
            }
        } catch {
            writeError = error.localizedDescription
        }
    }

    func updateAppInfoField(_ field: String, value: String) async {
        guard let service else { return }
        writeError = nil

        // Fields that live on different ASC resources:
        // - copyright → appStoreVersions (PATCH /v1/appStoreVersions/{id})
        // - contentRightsDeclaration → apps (PATCH /v1/apps/{id})
        // - primaryCategory, subcategories → appInfos relationships (PATCH /v1/appInfos/{id})
        if field == "copyright" {
            guard let versionId = appStoreVersions.first?.id else { return }
            do {
                try await service.patchVersion(id: versionId, fields: [field: value])
            } catch {
                writeError = error.localizedDescription
            }
        } else if field == "contentRightsDeclaration" {
            guard let appId = app?.id else { return }
            do {
                try await service.patchApp(id: appId, fields: [field: value])
                // Refetch app to reflect the change
                app = try await service.fetchApp(bundleId: app?.bundleId ?? "")
            } catch {
                writeError = error.localizedDescription
            }
        } else if let infoId = appInfo?.id {
            do {
                try await service.patchAppInfo(id: infoId, fields: [field: value])
                appInfo = try? await service.fetchAppInfo(appId: app?.id ?? "")
            } catch {
                writeError = error.localizedDescription
            }
        }
    }

    func updateAgeRating(_ attributes: [String: Any]) async {
        guard let service else { return }
        guard let id = ageRatingDeclaration?.id else { return }
        writeError = nil
        do {
            try await service.patchAgeRating(id: id, attributes: attributes)
            if let latestId = appStoreVersions.first?.id {
                ageRatingDeclaration = try? await service.fetchAgeRating(versionId: latestId)
            }
        } catch {
            writeError = error.localizedDescription
        }
    }

    func updateReviewContact(_ attributes: [String: Any]) async {
        guard let service else { return }
        guard let versionId = appStoreVersions.first?.id else { return }
        writeError = nil
        do {
            try await service.createOrPatchReviewDetail(versionId: versionId, attributes: attributes)
            reviewDetail = try? await service.fetchReviewDetail(versionId: versionId)
        } catch {
            writeError = error.localizedDescription
        }
    }

    func setPriceFree() async {
        guard let service else { return }
        guard let appId = app?.id else { return }
        writeError = nil
        do {
            try await service.setPriceFree(appId: appId)
            pricingStatus = "Free"
        } catch {
            writeError = error.localizedDescription
        }
    }

    func uploadScreenshots(paths: [String], displayType: String, locale: String) async {
        guard let service else { writeError = "ASC service not configured"; return }
        // Ensure localizations are loaded (may be empty if tab hasn't been visited)
        if localizations.isEmpty, let versionId = appStoreVersions.first?.id {
            localizations = (try? await service.fetchLocalizations(versionId: versionId)) ?? []
        }
        // If still no versions loaded, try fetching those too
        if localizations.isEmpty, let appId = app?.id {
            let versions = (try? await service.fetchAppStoreVersions(appId: appId)) ?? []
            appStoreVersions = versions
            if let versionId = versions.first?.id {
                localizations = (try? await service.fetchLocalizations(versionId: versionId)) ?? []
            }
        }
        guard let loc = localizations.first(where: { $0.attributes.locale == locale })
                ?? localizations.first else {
            writeError = "No localizations found for locale '\(locale)'. Check that a version exists."
            return
        }
        writeError = nil
        do {
            for path in paths {
                try await service.uploadScreenshot(localizationId: loc.id, path: path, displayType: displayType)
            }
            let sets = try await service.fetchScreenshotSets(localizationId: loc.id)
            screenshotSets = sets
            for set in sets {
                screenshots[set.id] = try await service.fetchScreenshots(setId: set.id)
            }
        } catch {
            writeError = error.localizedDescription
        }
    }

    func submitForReview() async {
        guard let service else { return }
        guard let appId = app?.id, let versionId = appStoreVersions.first?.id else { return }
        isSubmitting = true
        submissionError = nil
        do {
            try await service.submitForReview(appId: appId, versionId: versionId)
            isSubmitting = false
            // Refresh versions to show new state
            appStoreVersions = try await service.fetchAppStoreVersions(appId: appId)
        } catch {
            isSubmitting = false
            submissionError = error.localizedDescription
        }
    }

    func flushPendingLocalizations() async {
        guard let service else { return }
        let appInfoLocFieldNames: Set<String> = ["name", "title", "subtitle", "privacyPolicyUrl"]
        for (tab, fields) in pendingFormValues {
            if tab == "storeListing" {
                var versionLocFields: [String: String] = [:]
                var infoLocFields: [String: String] = [:]
                for (field, value) in fields {
                    if appInfoLocFieldNames.contains(field) {
                        let apiField = (field == "title") ? "name" : field
                        infoLocFields[apiField] = value
                    } else {
                        versionLocFields[field] = value
                    }
                }
                if !versionLocFields.isEmpty, let locId = localizations.first?.id {
                    try? await service.patchLocalization(id: locId, fields: versionLocFields)
                }
                if !infoLocFields.isEmpty, let infoLocId = appInfoLocalization?.id {
                    try? await service.patchAppInfoLocalization(id: infoLocId, fields: infoLocFields)
                }
            }
        }
        pendingFormValues = [:]
    }
}
