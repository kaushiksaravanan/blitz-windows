import Foundation
import CryptoKit

// MARK: - Error

enum ASCError: LocalizedError {
    case invalidURL
    case notFound(String)
    case httpError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .notFound(let what): return "\(what) not found"
        case .httpError(let code, let body): return "HTTP \(code): \(body.prefix(300))"
        }
    }
}

// MARK: - Service

final class AppStoreConnectService {
    private let credentials: ASCCredentials
    private var cachedToken: String?
    private var tokenExpiry: Date?

    private let baseHost = "api.appstoreconnect.apple.com"
    private let session = URLSession.shared

    init(credentials: ASCCredentials) {
        self.credentials = credentials
    }

    // MARK: - JWT

    private func generateJWT() throws -> String {
        let now = Date()
        let expiry = now.addingTimeInterval(1200)

        let header: [String: Any] = [
            "alg": "ES256",
            "kid": credentials.keyId,
            "typ": "JWT"
        ]
        let payload: [String: Any] = [
            "iss": credentials.issuerId,
            "iat": Int(now.timeIntervalSince1970),
            "exp": Int(expiry.timeIntervalSince1970),
            "aud": "appstoreconnect-v1"
        ]

        let headerData = try JSONSerialization.data(withJSONObject: header)
        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        let headerEncoded = base64urlEncode(headerData)
        let payloadEncoded = base64urlEncode(payloadData)
        let message = "\(headerEncoded).\(payloadEncoded)"

        let privateKey = try P256.Signing.PrivateKey(pemRepresentation: credentials.privateKey)
        let signature = try privateKey.signature(for: Data(message.utf8))
        let signatureEncoded = base64urlEncode(signature.rawRepresentation)

        tokenExpiry = expiry
        return "\(message).\(signatureEncoded)"
    }

    private func validToken() throws -> String {
        if let token = cachedToken, let expiry = tokenExpiry,
           Date().addingTimeInterval(60) < expiry {
            return token
        }
        let token = try generateJWT()
        cachedToken = token
        return token
    }

    private func base64urlEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))
    }

    // MARK: - HTTP

    private func makeRequest(path: String, queryItems: [URLQueryItem] = []) throws -> URLRequest {
        var components = URLComponents()
        components.scheme = "https"
        components.host = baseHost
        components.path = "/v1/\(path)"
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else { throw ASCError.invalidURL }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.setValue("Bearer \(try validToken())", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem] = [], as type: T.Type) async throws -> T {
        let request = try makeRequest(path: path, queryItems: queryItems)
        let (data, response) = try await session.data(for: request)

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw ASCError.httpError(http.statusCode, body)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func patch(path: String, body: [String: Any]) async throws {
        var request = try makeRequest(path: path)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw ASCError.httpError(http.statusCode, body)
        }
    }

    private func post(path: String, body: [String: Any]) async throws -> Data {
        var request = try makeRequest(path: path)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw ASCError.httpError(http.statusCode, body)
        }
        return data
    }

    private func delete(path: String) async throws {
        var request = try makeRequest(path: path)
        request.httpMethod = "DELETE"

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw ASCError.httpError(http.statusCode, body)
        }
    }

    private func upload(url: URL, method: String, headers: [String: String], body: Data) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = method
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let respBody = String(data: data, encoding: .utf8) ?? ""
            throw ASCError.httpError(http.statusCode, respBody)
        }
    }

    // MARK: - App

    func fetchApp(bundleId: String) async throws -> ASCApp {
        let resp = try await get("apps", queryItems: [
            URLQueryItem(name: "filter[bundleId]", value: bundleId),
            URLQueryItem(name: "limit", value: "1")
        ], as: ASCListResponse<ASCApp>.self)
        guard let app = resp.data.first else {
            throw ASCError.notFound("App with bundle ID '\(bundleId)'")
        }
        return app
    }

    // MARK: - App Store Versions

    func fetchAppStoreVersions(appId: String) async throws -> [ASCAppStoreVersion] {
        let resp = try await get("apps/\(appId)/appStoreVersions", queryItems: [
            URLQueryItem(name: "limit", value: "20")
        ], as: ASCListResponse<ASCAppStoreVersion>.self)
        return resp.data
    }

    // MARK: - Localizations

    func fetchLocalizations(versionId: String) async throws -> [ASCVersionLocalization] {
        let resp = try await get(
            "appStoreVersions/\(versionId)/appStoreVersionLocalizations",
            as: ASCListResponse<ASCVersionLocalization>.self
        )
        return resp.data
    }

    // MARK: - Screenshots

    func fetchScreenshotSets(localizationId: String) async throws -> [ASCScreenshotSet] {
        let resp = try await get(
            "appStoreVersionLocalizations/\(localizationId)/appScreenshotSets",
            as: ASCListResponse<ASCScreenshotSet>.self
        )
        return resp.data
    }

    func fetchScreenshots(setId: String) async throws -> [ASCScreenshot] {
        let resp = try await get(
            "appScreenshotSets/\(setId)/appScreenshots",
            as: ASCListResponse<ASCScreenshot>.self
        )
        return resp.data
    }

    // MARK: - Customer Reviews

    func fetchCustomerReviews(appId: String) async throws -> [ASCCustomerReview] {
        let resp = try await get("apps/\(appId)/customerReviews", queryItems: [
            URLQueryItem(name: "sort", value: "-createdDate"),
            URLQueryItem(name: "limit", value: "50")
        ], as: ASCListResponse<ASCCustomerReview>.self)
        return resp.data
    }

    // MARK: - Builds

    func fetchBuilds(appId: String) async throws -> [ASCBuild] {
        let resp = try await get("builds", queryItems: [
            URLQueryItem(name: "filter[app]", value: appId),
            URLQueryItem(name: "sort", value: "-uploadedDate"),
            URLQueryItem(name: "limit", value: "50")
        ], as: ASCListResponse<ASCBuild>.self)
        return resp.data
    }

    // MARK: - Beta Groups

    func fetchBetaGroups(appId: String) async throws -> [ASCBetaGroup] {
        let resp = try await get(
            "apps/\(appId)/betaGroups",
            as: ASCListResponse<ASCBetaGroup>.self
        )
        return resp.data
    }

    // MARK: - Beta Localizations

    func fetchBetaLocalizations(appId: String) async throws -> [ASCBetaLocalization] {
        let resp = try await get(
            "apps/\(appId)/betaAppLocalizations",
            as: ASCListResponse<ASCBetaLocalization>.self
        )
        return resp.data
    }

    func patchBetaLocalization(id: String, locale: String, description: String?,
                               feedbackEmail: String?, marketingUrl: String?,
                               privacyPolicyUrl: String?) async throws {
        var attrs: [String: Any] = [:]
        if let v = description { attrs["description"] = v }
        if let v = feedbackEmail { attrs["feedbackEmail"] = v }
        if let v = marketingUrl { attrs["marketingUrl"] = v }
        if let v = privacyPolicyUrl { attrs["privacyPolicyUrl"] = v }

        let body: [String: Any] = [
            "data": [
                "type": "betaAppLocalizations",
                "id": id,
                "attributes": attrs
            ]
        ]
        try await patch(path: "betaAppLocalizations/\(id)", body: body)
    }

    // MARK: - Beta Feedback

    func fetchBetaFeedback(buildId: String) async throws -> [ASCBetaFeedback] {
        let resp = try await get("betaFeedback", queryItems: [
            URLQueryItem(name: "filter[build]", value: buildId),
            URLQueryItem(name: "limit", value: "50")
        ], as: ASCListResponse<ASCBetaFeedback>.self)
        return resp.data
    }

    // MARK: - Write: Localization

    func patchLocalization(id: String, fields: [String: String]) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "appStoreVersionLocalizations",
                "id": id,
                "attributes": fields
            ]
        ]
        try await patch(path: "appStoreVersionLocalizations/\(id)", body: body)
    }

    // MARK: - Write: AppInfoLocalization

    func patchAppInfoLocalization(id: String, privacyPolicyUrl: String) async throws {
        try await patchAppInfoLocalization(id: id, fields: ["privacyPolicyUrl": privacyPolicyUrl])
    }

    /// Patch appInfoLocalizations with arbitrary fields (name, subtitle, privacyPolicyUrl, etc.)
    func patchAppInfoLocalization(id: String, fields: [String: String]) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "appInfoLocalizations",
                "id": id,
                "attributes": fields
            ] as [String: Any]
        ]
        try await patch(path: "appInfoLocalizations/\(id)", body: body)
    }

    // MARK: - Write: Version

    func patchVersion(id: String, fields: [String: String]) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "appStoreVersions",
                "id": id,
                "attributes": fields
            ]
        ]
        try await patch(path: "appStoreVersions/\(id)", body: body)
    }

    /// Attach a build to an app store version (PATCH relationship)
    func attachBuild(versionId: String, buildId: String) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "appStoreVersions",
                "id": versionId,
                "relationships": [
                    "build": [
                        "data": ["type": "builds", "id": buildId]
                    ]
                ]
            ] as [String: Any]
        ]
        try await patch(path: "appStoreVersions/\(versionId)", body: body)
    }

    // MARK: - Write: App

    func patchApp(id: String, fields: [String: String]) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "apps",
                "id": id,
                "attributes": fields
            ]
        ]
        try await patch(path: "apps/\(id)", body: body)
    }

    // MARK: - Write: AppInfo

    /// Patch appInfos — only supports relationship fields (primaryCategory, subcategories, etc.)
    /// AppInfoUpdateRequest has NO attributes per the ASC OpenAPI spec.
    func patchAppInfo(id: String, fields: [String: String]) async throws {
        let categoryFields = ["primaryCategory", "primarySubcategoryOne", "primarySubcategoryTwo",
                              "secondaryCategory", "secondarySubcategoryOne", "secondarySubcategoryTwo"]
        var relationships: [String: Any] = [:]
        for field in categoryFields {
            if let value = fields[field] {
                relationships[field] = [
                    "data": ["type": "appCategories", "id": value]
                ] as [String: Any]
            }
        }
        guard !relationships.isEmpty else { return }
        let data: [String: Any] = [
            "type": "appInfos",
            "id": id,
            "relationships": relationships
        ]
        try await patch(path: "appInfos/\(id)", body: ["data": data])
    }

    // MARK: - Write: AgeRating

    func patchAgeRating(id: String, attributes: [String: Any]) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "ageRatingDeclarations",
                "id": id,
                "attributes": attributes
            ]
        ]
        try await patch(path: "ageRatingDeclarations/\(id)", body: body)
    }

    // MARK: - Write: ReviewDetail

    func createOrPatchReviewDetail(versionId: String, attributes: [String: Any]) async throws {
        // Try to fetch existing
        do {
            let existing = try await get(
                "appStoreVersions/\(versionId)/appStoreReviewDetail",
                as: ASCSingleResponse<ASCReviewDetail>.self
            )
            // PATCH existing
            let body: [String: Any] = [
                "data": [
                    "type": "appStoreReviewDetails",
                    "id": existing.data.id,
                    "attributes": attributes
                ]
            ]
            try await patch(path: "appStoreReviewDetails/\(existing.data.id)", body: body)
        } catch {
            // POST new
            let body: [String: Any] = [
                "data": [
                    "type": "appStoreReviewDetails",
                    "attributes": attributes,
                    "relationships": [
                        "appStoreVersion": [
                            "data": ["type": "appStoreVersions", "id": versionId]
                        ]
                    ]
                ]
            ]
            _ = try await post(path: "appStoreReviewDetails", body: body)
        }
    }

    // MARK: - Write: Pricing (Free)

    func setPriceFree(appId: String) async throws {
        // Fetch the FREE price point for USA territory
        let pricePoints = try await get("apps/\(appId)/appPricePoints", queryItems: [
            URLQueryItem(name: "filter[territory]", value: "USA"),
            URLQueryItem(name: "limit", value: "200")
        ], as: ASCListResponse<ASCPricePoint>.self)

        guard let freePoint = pricePoints.data.first(where: { $0.attributes.customerPrice == "0" || $0.attributes.customerPrice == "0.0" || $0.attributes.customerPrice == "0.00" }) else {
            throw ASCError.notFound("Free price point")
        }

        let body: [String: Any] = [
            "data": [
                "type": "appPriceSchedules",
                "relationships": [
                    "app": ["data": ["type": "apps", "id": appId]],
                    "baseTerritory": ["data": ["type": "territories", "id": "USA"]],
                    "manualPrices": ["data": [["type": "appPrices", "id": "${price0}"]]]
                ]
            ] as [String: Any],
            "included": [
                [
                    "type": "appPrices",
                    "id": "${price0}",
                    "relationships": [
                        "appPricePoint": ["data": ["type": "appPricePoints", "id": freePoint.id]]
                    ]
                ] as [String: Any]
            ]
        ]
        _ = try await post(path: "appPriceSchedules", body: body)
    }

    // MARK: - Write: Screenshot Upload

    func uploadScreenshot(localizationId: String, path: String, displayType: String) async throws {
        // Step 1: Ensure screenshot set exists
        let sets = try await fetchScreenshotSets(localizationId: localizationId)
        let setId: String
        if let existing = sets.first(where: { $0.attributes.screenshotDisplayType == displayType }) {
            setId = existing.id
        } else {
            let createBody: [String: Any] = [
                "data": [
                    "type": "appScreenshotSets",
                    "attributes": ["screenshotDisplayType": displayType],
                    "relationships": [
                        "appStoreVersionLocalization": [
                            "data": ["type": "appStoreVersionLocalizations", "id": localizationId]
                        ]
                    ]
                ]
            ]
            let data = try await post(path: "appScreenshotSets", body: createBody)
            let created = try JSONDecoder().decode(ASCSingleResponse<ASCScreenshotSet>.self, from: data)
            setId = created.data.id
        }

        // Step 2: Reserve the screenshot
        let fileURL = URL(fileURLWithPath: path)
        let fileData = try Data(contentsOf: fileURL)
        let fileName = fileURL.lastPathComponent
        let reserveBody: [String: Any] = [
            "data": [
                "type": "appScreenshots",
                "attributes": [
                    "fileName": fileName,
                    "fileSize": fileData.count
                ],
                "relationships": [
                    "appScreenshotSet": [
                        "data": ["type": "appScreenshotSets", "id": setId]
                    ]
                ]
            ]
        ]
        let reserveData = try await post(path: "appScreenshots", body: reserveBody)
        let reserved = try JSONDecoder().decode(ASCSingleResponse<ASCScreenshotReservation>.self, from: reserveData)
        let screenshotId = reserved.data.id

        // Step 3: Upload to the provided upload operations
        for op in reserved.data.attributes.uploadOperations ?? [] {
            guard let uploadURL = URL(string: op.url) else { continue }
            let offset = op.offset
            let length = op.length
            let chunk = fileData[offset..<min(offset + length, fileData.count)]
            var headers = [String: String]()
            for header in op.requestHeaders {
                headers[header.name] = header.value
            }
            try await upload(url: uploadURL, method: op.method, headers: headers, body: Data(chunk))
        }

        // Step 4: Commit the upload
        let commitBody: [String: Any] = [
            "data": [
                "type": "appScreenshots",
                "id": screenshotId,
                "attributes": [
                    "uploaded": true,
                    "sourceFileChecksum": reserved.data.attributes.sourceFileChecksum ?? ""
                ]
            ]
        ]
        try await patch(path: "appScreenshots/\(screenshotId)", body: commitBody)
    }

    // MARK: - Write: Build Encryption

    func patchBuildEncryption(buildId: String, usesNonExemptEncryption: Bool) async throws {
        let body: [String: Any] = [
            "data": [
                "type": "builds",
                "id": buildId,
                "attributes": [
                    "usesNonExemptEncryption": usesNonExemptEncryption
                ]
            ]
        ]
        try await patch(path: "builds/\(buildId)", body: body)
    }

    // MARK: - Fetch: AppInfo

    func fetchAppInfo(appId: String) async throws -> ASCAppInfo {
        // include=primaryCategory so the relationship data (with category ID) is populated
        let resp = try await get("apps/\(appId)/appInfos", queryItems: [
            URLQueryItem(name: "limit", value: "1"),
            URLQueryItem(name: "include", value: "primaryCategory")
        ], as: ASCListResponse<ASCAppInfo>.self)
        guard let info = resp.data.first else {
            throw ASCError.notFound("AppInfo for app \(appId)")
        }
        return info
    }

    // MARK: - Fetch: AgeRating

    func fetchAgeRating(versionId: String) async throws -> ASCAgeRatingDeclaration {
        let resp = try await get(
            "appStoreVersions/\(versionId)/ageRatingDeclaration",
            as: ASCSingleResponse<ASCAgeRatingDeclaration>.self
        )
        return resp.data
    }

    // MARK: - Fetch: ReviewDetail

    func fetchReviewDetail(versionId: String) async throws -> ASCReviewDetail {
        let resp = try await get(
            "appStoreVersions/\(versionId)/appStoreReviewDetail",
            as: ASCSingleResponse<ASCReviewDetail>.self
        )
        return resp.data
    }

    // MARK: - Fetch: AppInfoLocalization

    func fetchAppInfoLocalization(appInfoId: String) async throws -> ASCAppInfoLocalization {
        let resp = try await get(
            "appInfos/\(appInfoId)/appInfoLocalizations",
            queryItems: [URLQueryItem(name: "limit", value: "1")],
            as: ASCListResponse<ASCAppInfoLocalization>.self
        )
        guard let loc = resp.data.first else {
            throw ASCError.notFound("AppInfoLocalization for appInfo \(appInfoId)")
        }
        return loc
    }

    // MARK: - Pricing Check

    /// Check if pricing has been configured for an app.
    /// Fetches the price schedule and checks for manual prices.
    func fetchPricingConfigured(appId: String) async -> Bool {
        do {
            // First get the schedule ID
            let schedule = try await get(
                "apps/\(appId)/appPriceSchedule",
                as: ASCSingleResponse<ASCPriceSchedule>.self
            )
            // Then check if it has manual prices configured
            let prices = try await get(
                "appPriceSchedules/\(schedule.data.id)/manualPrices",
                queryItems: [URLQueryItem(name: "limit", value: "1")],
                as: ASCListResponse<ASCPriceScheduleEntry>.self
            )
            return !prices.data.isEmpty
        } catch {
            return false
        }
    }

    // MARK: - Bundle IDs

    func fetchBundleId(identifier: String) async throws -> ASCBundleId? {
        let resp = try await get("bundleIds", queryItems: [
            URLQueryItem(name: "filter[identifier]", value: identifier),
            URLQueryItem(name: "limit", value: "1")
        ], as: ASCListResponse<ASCBundleId>.self)
        return resp.data.first
    }

    func registerBundleId(identifier: String, name: String) async throws -> ASCBundleId {
        let body: [String: Any] = [
            "data": [
                "type": "bundleIds",
                "attributes": [
                    "identifier": identifier,
                    "name": name,
                    "platform": "IOS"
                ]
            ]
        ]
        let data = try await post(path: "bundleIds", body: body)
        let result = try JSONDecoder().decode(ASCSingleResponse<ASCBundleId>.self, from: data)
        return result.data
    }

    // MARK: - Certificates

    func fetchDistributionCertificates() async throws -> [ASCCertificate] {
        let resp = try await get("certificates", queryItems: [
            URLQueryItem(name: "filter[certificateType]", value: "DISTRIBUTION"),
            URLQueryItem(name: "limit", value: "50")
        ], as: ASCListResponse<ASCCertificate>.self)
        return resp.data
    }

    func createCertificate(csrContent: String) async throws -> ASCCertificate {
        let body: [String: Any] = [
            "data": [
                "type": "certificates",
                "attributes": [
                    "certificateType": "DISTRIBUTION",
                    "csrContent": csrContent
                ]
            ]
        ]
        let data = try await post(path: "certificates", body: body)
        let result = try JSONDecoder().decode(ASCSingleResponse<ASCCertificate>.self, from: data)
        return result.data
    }

    // MARK: - Profiles

    func createProfile(name: String, bundleIdResourceId: String, certificateId: String) async throws -> ASCProfile {
        let body: [String: Any] = [
            "data": [
                "type": "profiles",
                "attributes": [
                    "name": name,
                    "profileType": "IOS_APP_STORE"
                ],
                "relationships": [
                    "bundleId": [
                        "data": ["type": "bundleIds", "id": bundleIdResourceId]
                    ],
                    "certificates": [
                        "data": [["type": "certificates", "id": certificateId]]
                    ]
                ]
            ]
        ]
        let data = try await post(path: "profiles", body: body)
        let result = try JSONDecoder().decode(ASCSingleResponse<ASCProfile>.self, from: data)
        return result.data
    }

    // MARK: - Build Polling

    func fetchLatestBuild(appId: String) async throws -> ASCBuild? {
        let resp = try await get("builds", queryItems: [
            URLQueryItem(name: "filter[app]", value: appId),
            URLQueryItem(name: "sort", value: "-uploadedDate"),
            URLQueryItem(name: "limit", value: "1")
        ], as: ASCListResponse<ASCBuild>.self)
        return resp.data.first
    }

    // MARK: - Submit for Review

    func submitForReview(appId: String, versionId: String) async throws {
        // Step 1: Create review submission
        let submissionBody: [String: Any] = [
            "data": [
                "type": "reviewSubmissions",
                "relationships": [
                    "app": ["data": ["type": "apps", "id": appId]]
                ]
            ]
        ]
        let submissionData = try await post(path: "reviewSubmissions", body: submissionBody)
        let submission = try JSONDecoder().decode(ASCSingleResponse<ASCReviewSubmission>.self, from: submissionData)
        let submissionId = submission.data.id

        // Step 2: Add submission item (the version)
        let itemBody: [String: Any] = [
            "data": [
                "type": "reviewSubmissionItems",
                "relationships": [
                    "reviewSubmission": ["data": ["type": "reviewSubmissions", "id": submissionId]],
                    "appStoreVersion": ["data": ["type": "appStoreVersions", "id": versionId]]
                ]
            ]
        ]
        _ = try await post(path: "reviewSubmissionItems", body: itemBody)

        // Step 3: Confirm submission
        let confirmBody: [String: Any] = [
            "data": [
                "type": "reviewSubmissions",
                "id": submissionId,
                "attributes": ["submitted": true]
            ]
        ]
        try await patch(path: "reviewSubmissions/\(submissionId)", body: confirmBody)
    }
}

// MARK: - Supporting Types for Upload/Submission

struct ASCPricePoint: Decodable, Identifiable {
    let id: String
    struct Attributes: Decodable {
        let customerPrice: String?
    }
    let attributes: Attributes
}

struct ASCScreenshotReservation: Decodable, Identifiable {
    let id: String
    struct Attributes: Decodable {
        let sourceFileChecksum: String?
        let uploadOperations: [UploadOperation]?
    }
    let attributes: Attributes

    struct UploadOperation: Decodable {
        let method: String
        let url: String
        let offset: Int
        let length: Int
        let requestHeaders: [Header]

        struct Header: Decodable {
            let name: String
            let value: String
        }
    }
}

struct ASCReviewSubmission: Decodable, Identifiable {
    let id: String
    struct Attributes: Decodable {
        let state: String?
    }
    let attributes: Attributes
}
