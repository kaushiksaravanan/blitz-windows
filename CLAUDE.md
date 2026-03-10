# Blitz — Claude MCP Tool Reference

## asc_fill_form

Fill App Store Connect form fields. Auto-navigates to the tab (if auto-nav permission is on).

### Tabs and fields

**storeListing**
| field | type | required | notes |
|---|---|---|---|
| title | string | yes | App name (max 30 chars) |
| subtitle | string | no | (max 30 chars) |
| description | string | yes | (max 4000 chars) |
| keywords | string | yes | comma-separated, max 100 chars total |
| promotionalText | string | no | (max 170 chars) |
| marketingUrl | string | no | |
| supportUrl | string | yes | |
| whatsNew | string | no | first version must omit |
| privacyPolicyUrl | string | yes | |

**appDetails**
| field | type | required | values |
|---|---|---|---|
| copyright | string | yes | e.g. "2026 Acme Inc" |
| primaryCategory | string | yes | GAMES, UTILITIES, PRODUCTIVITY, SOCIAL_NETWORKING, PHOTO_AND_VIDEO, MUSIC, TRAVEL, SPORTS, HEALTH_AND_FITNESS, EDUCATION, BUSINESS, FINANCE, NEWS, FOOD_AND_DRINK, LIFESTYLE, SHOPPING, ENTERTAINMENT, REFERENCE, MEDICAL, NAVIGATION, WEATHER, DEVELOPER_TOOLS |
| contentRightsDeclaration | string | yes | DOES_NOT_USE_THIRD_PARTY_CONTENT / USES_THIRD_PARTY_CONTENT |

**pricing**
| field | type | required | values |
|---|---|---|---|
| isFree | string | yes | "true" / "false" |

**review.ageRating**
Boolean fields (value "true"/"false"):
`gambling`, `messagingAndChat`, `unrestrictedWebAccess`, `userGeneratedContent`, `advertising`, `lootBox`, `healthOrWellnessTopics`, `parentalControls`, `ageAssurance`

Three-level string fields (value "NONE"/"INFREQUENT_OR_MILD"/"FREQUENT_OR_INTENSE"):
`alcoholTobaccoOrDrugUseOrReferences`, `contests`, `gamblingSimulated`, `gunsOrOtherWeapons`, `horrorOrFearThemes`, `matureOrSuggestiveThemes`, `medicalOrTreatmentInformation`, `profanityOrCrudeHumor`, `sexualContentGraphicAndNudity`, `sexualContentOrNudity`, `violenceCartoonOrFantasy`, `violenceRealistic`, `violenceRealisticProlongedGraphicOrSadistic`

**review.contact**
| field | type | required |
|---|---|---|
| contactFirstName | string | yes |
| contactLastName | string | yes |
| contactEmail | string | yes |
| contactPhone | string | yes |
| notes | string | no |
| demoAccountRequired | string | no |
| demoAccountName | string | conditional |
| demoAccountPassword | string | conditional |

**settings.bundleId**
| field | type | required |
|---|---|---|
| bundleId | string | yes |

---

## get_tab_state

Read the structured data state of any Blitz tab. Returns form field values, submission readiness, versions, builds, localizations, etc. **Use this instead of screenshots to read UI state.**

| param | type | required | notes |
|---|---|---|---|
| tab | string | no | Tab to query. Defaults to currently active tab. |

Valid tabs: `ascOverview`, `storeListing`, `screenshots`, `appDetails`, `pricing`, `review`, `analytics`, `reviews`, `builds`, `groups`, `betaInfo`, `feedback`

Returns JSON with tab-specific fields. Common fields across all tabs:
- `tab` — which tab was queried
- `isLoading` — whether data is still loading
- `error` / `writeError` — any errors
- `app` — app identity (id, name, bundleId) for ASC tabs

**Tab-specific return data:**
- `ascOverview` → `submissionReadiness` (isComplete, fields[], missingRequired[]), `latestVersion`, `totalVersions`
- `storeListing` → `localization` (title, subtitle, description, keywords, etc.), `privacyPolicyUrl`, `localeCount`
- `appDetails` → `appInfo` (primaryCategory, contentRightsDeclaration), `latestVersion`, `versionCount`
- `review` → `ageRating` (all 22 fields), `reviewContact` (name, email, phone, etc.), `builds[]`
- `screenshots` → `screenshotSets[]` (displayType, screenshotCount), `localeCount`
- `reviews` → `reviews[]` (title, body, rating), `totalReviews`
- `builds` → `builds[]` (version, processingState, uploadedDate)
- `groups` → `betaGroups[]` (name, isInternalGroup)

---

## asc_upload_screenshots

```json
{
  "screenshotPaths": ["/tmp/screen1.png", "/tmp/screen2.png"],
  "displayType": "APP_IPHONE_67",
  "locale": "en-US"
}
```

Capture screenshots first using existing `get_simulator_screenshot` tool, then pass paths here.
Required display types: APP_IPHONE_67 (mandatory), APP_IPAD_PRO_3GEN_129 (mandatory for all apps).
Both iPhone and iPad screenshots must be uploaded for submission readiness.

---

## asc_open_submit_preview

No arguments. Checks all required fields and either:
- Opens the Submit for Review modal if everything is complete
- Returns a list of missing fields to fix first

---

---

## app_store_setup_signing

Set up iOS code signing for App Store distribution. Registers the bundle ID, creates a distribution certificate (if none exists), creates and installs a provisioning profile, and configures the Xcode project. **Idempotent** — re-running skips already-completed steps.

| param | type | required | notes |
|---|---|---|---|
| teamId | string | no | Apple Developer Team ID. Saved to project metadata after first use. |

**Requires:** Active project with `bundleIdentifier` set (via `asc_fill_form tab=settings.bundleId`) and ASC credentials configured.

Returns: `bundleIdResourceId`, `certificateId`, `profileUUID`, `teamId`, `log[]`

---

## app_store_build

Build an IPA for App Store submission. Archives the Xcode project and exports a signed IPA.

| param | type | required | notes |
|---|---|---|---|
| scheme | string | no | Xcode scheme (auto-detected if omitted) |
| configuration | string | no | Build configuration (default: "Release") |

**Requires:** `app_store_setup_signing` must have been run first (needs teamId in project metadata).

Returns: `ipaPath`, `archivePath`, `log[]`

---

## app_store_upload

Upload an IPA to App Store Connect / TestFlight. Optionally polls until build processing completes.

| param | type | required | notes |
|---|---|---|---|
| ipaPath | string | no | Path to IPA (uses latest `app_store_build` output if omitted) |
| skipPolling | boolean | no | Skip waiting for build processing (default: false) |

Returns: `buildVersion`, `processingState`, `log[]`

**Note:** After upload, the tool automatically sets `usesNonExemptEncryption = false` on the build to avoid the export compliance prompt.

---

## Recommended full workflow (build + submission)

1. `app_store_setup_signing` teamId=YOUR_TEAM_ID (one-time per bundle ID)
2. `app_store_build`
3. `app_store_upload`
4. `asc_fill_form` tab=storeListing (description, keywords, supportUrl, privacyPolicyUrl)
5. `asc_fill_form` tab=appDetails (copyright, primaryCategory, contentRightsDeclaration)
6. `asc_fill_form` tab=review.ageRating (all 22 fields)
7. `asc_fill_form` tab=review.contact (contactFirstName...contactPhone)
8. `asc_fill_form` tab=pricing (isFree=true)
9. Use `get_simulator_screenshot` to capture, then `asc_upload_screenshots` for **both** APP_IPHONE_67 and APP_IPAD_PRO_3GEN_129
10. Tell user to set Privacy Nutrition Labels manually in App Store Connect (link shown in submission readiness)
11. `asc_open_submit_preview` — fix any flagged missing fields, then submit

## Recommended first-submission workflow (metadata only)

1. `asc_fill_form` tab=storeListing (description, keywords, supportUrl, privacyPolicyUrl)
2. `asc_fill_form` tab=appDetails (copyright, primaryCategory, contentRightsDeclaration)
3. `asc_fill_form` tab=review.ageRating (all 22 fields — set all to false/NONE for simple apps)
4. `asc_fill_form` tab=review.contact (contactFirstName...contactPhone)
5. `asc_fill_form` tab=pricing (isFree=true)
6. Use `get_simulator_screenshot` to capture, then `asc_upload_screenshots` for **both** APP_IPHONE_67 and APP_IPAD_PRO_3GEN_129
7. Tell user to set Privacy Nutrition Labels manually in App Store Connect (link shown in submission readiness)
8. `asc_open_submit_preview` — fix any flagged missing fields, then submit

**Note:** Privacy nutrition labels (app data usages) must be completed once manually at
App Store Connect — this is not exposed in Apple's REST API. The submission readiness
checklist shows an "Open in ASC" button linking directly to the privacy page for the app.
