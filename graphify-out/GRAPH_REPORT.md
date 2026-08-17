# Graph Report - faceid  (2026-08-17)

## Corpus Check
- Large corpus: 319 files · ~508,077 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1870 nodes · 5299 edges · 118 communities (91 shown, 27 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.56)
- Token cost: 12,306 input · 4,553 output

## Community Hubs (Navigation)
- API endpoints
- Biometric engine
- API endpoints
- Biometric engine
- API endpoints
- Public interface
- PostgreSQL storage
- Biometric engine
- Application internals
- Biometric engine
- API endpoints
- Biometric engine
- API endpoints
- API endpoints
- Person lifecycle
- Admin state
- Browser hooks
- API endpoints
- Application internals
- Application internals
- Person lifecycle
- API endpoints
- Biometric engine
- API endpoints
- API endpoints
- Public interface
- Biometric engine
- Application internals
- Attendance engine
- Application internals
- PostgreSQL storage
- PostgreSQL storage
- API endpoints
- API endpoints
- API endpoints
- Attendance engine
- Admin components
- Admin components
- Kiosk components
- Operations scripts
- Admin components
- Admin components
- Biometric engine
- Public interface
- Admin components
- Person lifecycle
- Person lifecycle
- Admin components
- Registration components
- Admin components
- Admin components
- Admin components
- Browser hooks
- Application internals
- Attendance engine
- API endpoints
- Admin components
- Attendance engine
- Attendance engine
- Application internals
- Application internals
- Biometric engine
- Application internals
- API endpoints
- Biometric engine
- PostgreSQL storage
- API endpoints
- Admin components
- Regression tests
- PostgreSQL storage
- API endpoints
- Application internals
- Biometric UI
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- API endpoints
- API endpoints
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Application internals
- Operations scripts
- Application internals
- Application internals
- Application internals

## God Nodes (most connected - your core abstractions)
1. `queryPostgres()` - 88 edges
2. `parseAdminSessionCookieValue()` - 75 edges
3. `getAdminSessionCookieName()` - 72 edges
4. `resolveAdminSession()` - 72 edges
5. `createOriginGuard()` - 67 edges
6. `writeAuditLog()` - 59 edges
7. `useAdminStore` - 44 edges
8. `processAttendanceSubmission()` - 41 edges
9. `postgresEnabled()` - 39 edges
10. `normalizeDescriptor()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `EmployeeReenrollPage()` --calls--> `useAdminStore`  [EXTRACTED]
  app/admin/employee/[personId]/reenroll/EmployeeReenrollPage.jsx → lib/admin/store.js
- `toggleIndividualWfhDay()` --calls--> `normalizeEmployeeWfhDays()`  [EXTRACTED]
  components/admin/EmployeeEditorModal.jsx → lib/employee-wfh.js
- `fetchData()` --calls--> `buildEmployeeViewHeaders()`  [EXTRACTED]
  components/kiosk/AttendanceTableView.jsx → lib/attendance-match.js
- `SummaryContent()` --calls--> `formatAttendanceDateKey()`  [EXTRACTED]
  app/(public)/summary/page.jsx → lib/attendance-time.js
- `fetchData()` --calls--> `formatAttendanceDateKey()`  [EXTRACTED]
  app/(public)/summary/page.jsx → lib/attendance-time.js

## Import Cycles
- None detected.

## Communities (118 total, 27 thin omitted)

### Community 0 - "API endpoints"
Cohesion: 0.06
Nodes (52): buildAttendanceMeResponse(), dynamic, GET(), dynamic, GET(), getMonthRange(), normalizeAttendanceMode(), computeSegments() (+44 more)

### Community 1 - "Biometric engine"
Cohesion: 0.07
Nodes (54): dynamic, GET(), getBearerToken(), POST(), requireBenchmarkSecret(), safeEqual(), alignFaceRgb(), assertOpenVinoRetailModelsAvailable() (+46 more)

### Community 2 - "API endpoints"
Cohesion: 0.10
Nodes (43): getPersonData(), ReenrollPage(), serializePerson(), AdminPage(), dynamic, POST(), dynamic, GET() (+35 more)

### Community 3 - "Biometric engine"
Cohesion: 0.08
Nodes (43): dynamic, maxDuration, POST(), toHttpStatus(), dynamic, POST(), toHttpStatus(), aggregateDescriptors() (+35 more)

### Community 4 - "API endpoints"
Cohesion: 0.09
Nodes (43): dynamic, GET(), runtime, runMatch(), BUCKET_DIMENSIONS_A, BUCKET_DIMENSIONS_B, buildIndexDocId(), buildMultiDescriptorRankedCandidates() (+35 more)

### Community 5 - "Public interface"
Cohesion: 0.08
Nodes (35): RegisterRuntimeApp, ScanRuntimeApp, handleDelete(), EmployeeReenrollPanel(), useBiometricRuntime(), BiometricWorkspaceGate(), RegisterRuntimeApp(), handleEnrollPerson() (+27 more)

### Community 6 - "PostgreSQL storage"
Cohesion: 0.11
Nodes (39): DELETE(), dynamic, normalizeBody(), PUT(), validateBody(), DELETE(), dynamic, normalizeBody() (+31 more)

### Community 7 - "Biometric engine"
Cohesion: 0.09
Nodes (41): ENROLLMENT_CAPTURE_POLICY_VERSION, getDescriptorMagnitude(), getDescriptorSpreadAssessment(), getScanCapturePolicyAssessment(), getTrackResolutionSummary(), HARD_BLOCK_DESCRIPTOR_SPREAD, hasUsableTemporalLiveness(), mapLivenessFailure() (+33 more)

### Community 8 - "Application internals"
Cohesion: 0.10
Nodes (42): addDtrWatermark(), appendDtrSpecialStyles(), appendDtrTimeValueStyles(), appendSectionElement(), buildCellXml(), buildDtrWorkbookFromTemplate(), buildRemarksSheetXml(), buildSheetEntries() (+34 more)

### Community 9 - "Biometric engine"
Cohesion: 0.09
Nodes (32): OVAL_FRAME_STYLE, CaptureDistanceHud(), resolveTone(), CaptureGuideHud(), resolveToneClasses(), KioskScanningOverlay(), OVAL_STYLE, CaptureStep() (+24 more)

### Community 10 - "API endpoints"
Cohesion: 0.13
Nodes (31): dynamic, GET(), dynamic, GET(), dynamic, POST(), buildDtrWorkbookBytes(), buildDtrWorkbookFilename() (+23 more)

### Community 11 - "Biometric engine"
Cohesion: 0.11
Nodes (32): metadata, AppProviders(), BiometricRuntimeContext, BiometricRuntimeProvider(), getDefaultLocationState(), getLocationErrorMessage(), getWifiSsid(), hasGrantedDevicePermissions() (+24 more)

### Community 12 - "API endpoints"
Cohesion: 0.11
Nodes (29): dynamic, GET(), getDeviceStatus(), dynamic, GET(), toNumber(), GET(), dynamic (+21 more)

### Community 13 - "API endpoints"
Cohesion: 0.16
Nodes (29): DELETE(), dynamic, PATCH(), refreshDailyRecord(), dynamic, GET(), POST(), dynamic (+21 more)

### Community 14 - "Person lifecycle"
Cohesion: 0.14
Nodes (28): createRouteTimer(), dynamic, GET(), POST(), toHttpStatus(), clampPersonDirectoryLimit(), decodePersonDirectoryCursor(), encodePersonDirectoryCursor() (+20 more)

### Community 15 - "Admin state"
Cohesion: 0.15
Nodes (19): AddRoleModal(), AdminsPanelInner(), DashboardPanelInner(), HrUsersPanel, HrUsersPanelInner(), SummaryPanelInner(), useAdmins(), useAttendance() (+11 more)

### Community 16 - "Browser hooks"
Cohesion: 0.14
Nodes (31): buildCandidate(), buildJpegDataUrl(), clamp(), estimateHeadPitch(), estimateHeadYaw(), getCaptureTimingProfile(), getPoseGuidanceMessage(), getReadyFaceFromDetections() (+23 more)

### Community 17 - "API endpoints"
Cohesion: 0.14
Nodes (29): dynamic, GET(), listDailyAttendanceRecordsForDate(), buildAttendanceSummary(), assignCheckInSegment(), assignCheckOutSegment(), assignLegacySegment(), attendanceClockFormatter (+21 more)

### Community 18 - "Application internals"
Cohesion: 0.10
Nodes (30): AMBIGUOUS_MATCH_MARGIN, ATTENDANCE_COLLECTION, CONFIRM_FRAMES, CONFIRMED_HOLD_MS, DETECTION_MAX_DIMENSION, DISTANCE_THRESHOLD, DISTANCE_THRESHOLD_KIOSK, DUPLICATE_FACE_THRESHOLD (+22 more)

### Community 19 - "Application internals"
Cohesion: 0.12
Nodes (31): buildAppXml(), buildCellXml(), buildContentTypesXml(), buildCoreXml(), buildRawAttendanceWorkbookBlob(), buildRawAttendanceWorkbookBytes(), buildRawAttendanceWorkbookFiles(), buildRawAttendanceWorksheets() (+23 more)

### Community 20 - "Person lifecycle"
Cohesion: 0.11
Nodes (27): buildReenrollmentDecision(), euclideanDistance(), findClosestPerson(), getBiometricReenrollmentAssessment(), getStoredVectors(), needsBiometricReenrollment(), normalizeCaptureMetadata(), normalizePhaseList() (+19 more)

### Community 21 - "API endpoints"
Cohesion: 0.15
Nodes (23): dynamic, GET(), summarize(), clamp(), dynamic, GET(), dynamic, GET() (+15 more)

### Community 22 - "Biometric engine"
Cohesion: 0.15
Nodes (26): clamp01(), countSamplesByPhase(), descriptorDistance(), ENROLLMENT_BURST_CAPTURE_ATTEMPTS, ENROLLMENT_BURST_CAPTURE_INTERVAL_MS, ENROLLMENT_MAX_BATCH_SAMPLES, ENROLLMENT_MAX_CROSS_PHASE_NEAREST_DISTANCE, ENROLLMENT_MAX_SAME_PHASE_DISTANCE (+18 more)

### Community 23 - "API endpoints"
Cohesion: 0.16
Nodes (23): DELETE(), dynamic, normalizeOfficePayload(), PUT(), validateOffice(), buildOfficeId(), dynamic, normalizeOfficePayload() (+15 more)

### Community 24 - "API endpoints"
Cohesion: 0.25
Nodes (26): access(), auditWorkforce(), canManageOrder(), canManageRecord(), DELETE(), dynamic, GET(), hasOrderRangeConflict() (+18 more)

### Community 25 - "Public interface"
Cohesion: 0.12
Nodes (15): AdminLogin(), AppShell(), baseNavItems, BrandMark(), fadeIn, fadeUp, howItWorks, PlatformNavigator() (+7 more)

### Community 26 - "Biometric engine"
Cohesion: 0.17
Nodes (25): mapDetectedFace(), measureFrameMetrics(), selectBestFallbackFace(), useVerificationBurst(), wait(), warnIfMissingIrisLandmarks(), normalizeDescriptor(), aggregateDescriptors() (+17 more)

### Community 27 - "Application internals"
Cohesion: 0.14
Nodes (24): buildDayRecordLookup(), buildDtrDocument(), buildDtrRangeSpec(), clampDtrDay(), deriveMiddleInitial(), DTR_DAY_DISPLAY_NAMES, DTR_DAY_NAMES, DTR_PANEL_DEFINITIONS (+16 more)

### Community 28 - "Attendance engine"
Cohesion: 0.18
Nodes (23): getPostMatchRiskFlags(), getPreMatchRiskFlags(), normalizeEntry(), normalizeScanFrames(), validateClaimedEmployeeId(), validateEntry(), appendServerTiming(), applyAuthoritativePayload() (+15 more)

### Community 29 - "Application internals"
Cohesion: 0.20
Nodes (24): buildBiometricBenchmarkReport(), buildBreakdown(), buildCheck(), buildDeviceQualityHotspots(), buildOperationalGate(), buildPilotContext(), clamp(), collectMetrics() (+16 more)

### Community 30 - "PostgreSQL storage"
Cohesion: 0.21
Nodes (22): dynamic, POST(), toHttpStatus(), buildDescriptorBuckets(), ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY, normalizeEmployeeWfhDays(), PERSON_APPROVAL_PENDING, serializeDescriptorSample() (+14 more)

### Community 31 - "PostgreSQL storage"
Cohesion: 0.17
Nodes (19): dynamic, GET(), toPublicOffice(), sanitizeAttendanceEntryForStorage(), getOfficeEmployeeCounts(), isTransientConnectionError(), listOfficeRecords(), officeCountsCache (+11 more)

### Community 32 - "API endpoints"
Cohesion: 0.18
Nodes (18): dynamic, GET(), POST(), dynamic, GET(), POST(), resolveSession(), dynamic (+10 more)

### Community 33 - "API endpoints"
Cohesion: 0.18
Nodes (20): dynamic, GET(), POST(), toNumber(), dynamic, GET(), normalizeBody(), POST() (+12 more)

### Community 34 - "API endpoints"
Cohesion: 0.25
Nodes (17): dynamic, POST(), dynamic, POST(), dynamic, GET(), POST(), DELETE() (+9 more)

### Community 35 - "Attendance engine"
Cohesion: 0.15
Nodes (18): MIN_SCAN_DESCRIPTOR_SPREAD, MIN_SCAN_STRICT_FRAMES, PAD_GRAY_ZONE_THRESHOLD, getGeofenceContext(), toFiniteNumber(), checkAttendanceLocation(), getPersonsForOfficeIds(), getManilaWeekday() (+10 more)

### Community 36 - "Admin components"
Cohesion: 0.19
Nodes (20): buildPrintableDocument(), EmployeeAccessCodeExportActions(), escapeHtml(), loadEmployeesForExport(), accessCode(), buildContentTypesXml(), buildEmployeeAccessCodeWorkbookBlob(), buildEmployeeAccessCodeWorkbookBytes() (+12 more)

### Community 37 - "Admin components"
Cohesion: 0.14
Nodes (7): AdminShell(), AdminsPanel, EmployeeDeleteModal(), ThresholdSettings, AdminDashboard(), usePendingApprovals(), useThresholds()

### Community 38 - "Kiosk components"
Cohesion: 0.17
Nodes (12): DtrModal(), DtrSelectionView(), AttendanceTableView(), fetchData(), buildYearOptions(), DayCard(), formatUndertime(), downloadResponseBlob() (+4 more)

### Community 39 - "Operations scripts"
Cohesion: 0.12
Nodes (13): loadRepoEnv(), parseEnvValue(), binDir, command, cwd, dataDir, logDir, logPath (+5 more)

### Community 40 - "Admin components"
Cohesion: 0.14
Nodes (11): EmployeeEditorModal(), handleMoveToReview(), handleQuickActivate(), handleQuickApprove(), handleQuickDeactivate(), handleQuickReject(), handleSave(), toggleIndividualWfhDay() (+3 more)

### Community 41 - "Admin components"
Cohesion: 0.23
Nodes (14): OfficeEditorModal(), DAY_LABELS, formatDays(), formatGeofenceSummary(), formatScheduleSummary(), OfficePanel(), buildEmptyOffice(), useOffices() (+6 more)

### Community 42 - "Biometric engine"
Cohesion: 0.25
Nodes (18): buildEngineShadowBenchmark(), buildPersonRank(), buildQueryCases(), buildShadowBenchmarkReport(), buildThresholdGrid(), DEFAULT_MARGINS, distance(), evaluateThreshold() (+10 more)

### Community 43 - "Public interface"
Cohesion: 0.28
Nodes (12): EmployeeSummaryPage(), MONTH_NAMES, SummaryContent(), fetchData(), buildEmployeeViewHeaders(), clearAttendanceMatch(), getNow(), isFiniteTimestamp() (+4 more)

### Community 44 - "Admin components"
Cohesion: 0.18
Nodes (10): BiometricBenchmarkPanel(), BreakdownList(), formatMetric(), formatMs(), formatPercent(), getBenchmarkParams(), getPhDateKey(), phDateFormatter (+2 more)

### Community 45 - "Person lifecycle"
Cohesion: 0.21
Nodes (12): queryAllBiometricIndexSamples(), syncPersonBiometricIndex(), collectDuplicateCandidatePersons(), evaluateDuplicateFaceCandidates(), buildDuplicateReviewFields(), checkDuplicateFace(), checkDuplicateFaceWithinTransaction(), deduplicateDescriptors() (+4 more)

### Community 46 - "Person lifecycle"
Cohesion: 0.24
Nodes (13): getEffectivePersonApprovalStatus(), getPersonLifecycleStatus(), isPersonBiometricActive(), normalizePersonApprovalStatus(), normalizePersonLifecycleStatus(), PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_REJECTED, normalizeCaptureMetadata() (+5 more)

### Community 47 - "Admin components"
Cohesion: 0.17
Nodes (6): EmployeeReenrollPage(), EmployeeReenrollPanel, DAYS, HrOfficeSettingsPanel(), updateNested(), DilgLoadingIndicator()

### Community 48 - "Registration components"
Cohesion: 0.18
Nodes (12): normalizeBody(), CompleteStep(), DetailsStep(), ReviewStep(), STEPS, ENROLLMENT_MIN_SAMPLES, PERSON_LIFECYCLE_PENDING, buildEmployeeDisplayName() (+4 more)

### Community 49 - "Admin components"
Cohesion: 0.18
Nodes (9): SummaryFilters(), SummaryTable(), SummaryPanel, RegisterStepRail(), Field(), InfoCard(), StatusBadge(), ToastContainer() (+1 more)

### Community 50 - "Admin components"
Cohesion: 0.15
Nodes (7): DashboardPanel, KioskDevicesCard(), load(), ReenrollmentQueueCard(), EmployeesPanel, EmployeesPanelInner(), useEmployees()

### Community 51 - "Admin components"
Cohesion: 0.20
Nodes (9): DtrPanel, DtrPanelInner(), HrEmployeesPanel, HrEmployeesPanelInner(), Badge(), hrStore, useHrEmployees(), useHrSession() (+1 more)

### Community 52 - "Browser hooks"
Cohesion: 0.23
Nodes (10): KioskAlert(), FIELD_DUTY_REASONS, KioskView(), normalizeEmployeeIdInput(), validateEmployeeIdInput(), useAudioCue(), percentile(), useKioskMetrics() (+2 more)

### Community 53 - "Application internals"
Cohesion: 0.13
Nodes (15): fflate, openvino-node, dependencies, fflate, next, openvino-node, react, tailwindcss (+7 more)

### Community 54 - "Attendance engine"
Cohesion: 0.30
Nodes (14): buildEmployeeViewSessionPayload(), createEmployeeViewSessionCookieValue(), employeeViewSessionMatchesEmployee(), getEmployeeViewSessionCookieName(), getEmployeeViewSessionRequestValue(), getSessionConfig(), isEmployeeViewSessionConfigured(), issueEmployeeViewSession() (+6 more)

### Community 55 - "API endpoints"
Cohesion: 0.27
Nodes (11): dynamic, GET(), POST(), resolveRegionalAdmin(), dynamic, POST(), safeEqual(), getRegionalPin() (+3 more)

### Community 56 - "Admin components"
Cohesion: 0.24
Nodes (12): ADD_LABELS, dateInputValue(), formatCalendarDate(), formatDateRange(), LEAVE_LABELS, readApiJson(), TABS, today() (+4 more)

### Community 57 - "Attendance engine"
Cohesion: 0.22
Nodes (12): buildCandidateSamplesForPerson(), findClaimedEmployeeMatch(), buildMatchSupportSnapshot(), isStrongUnambiguousSingleSampleSupport(), MATCH_SUPPORT_MIN_DESCRIPTOR_COUNT, MATCH_SUPPORT_SECONDARY_GAP, MATCH_SUPPORT_STRONG_GLOBAL_MARGIN, MATCH_SUPPORT_STRONG_SINGLE_DISTANCE (+4 more)

### Community 58 - "Attendance engine"
Cohesion: 0.28
Nodes (10): buildAttendanceDocId(), buildAttendanceEntryPreview(), buildStoredAttendanceEntry(), getAttendanceLogsForDate(), invalidateAttendanceCache(), updateDailyAttendanceCache(), writeAttendanceAtomically(), buildAttendancePreview() (+2 more)

### Community 59 - "Application internals"
Cohesion: 0.20
Nodes (6): AdminOfficePanel(), DAY_OPTIONS, formatTime(), OFFICE_TYPE_OPTIONS, OfficeLocationPicker(), REGION_XII_CENTER

### Community 60 - "Application internals"
Cohesion: 0.20
Nodes (3): DtrTimeRow(), hasTimes(), renderTime()

### Community 61 - "Biometric engine"
Cohesion: 0.40
Nodes (9): requestPreferredCameraStream(), useCamera(), getClientBiometricProfile(), getNavigatorDeviceProfile(), getSafeNavigator(), getVideoTrackMetadata(), getVideoTrackSettingsSnapshot(), isProbablyMobileDevice() (+1 more)

### Community 62 - "Application internals"
Cohesion: 0.18
Nodes (11): scripts, build, build:hosting, dev, openvino:smoke, postgres:migrate, postgres:start, postgres:status (+3 more)

### Community 63 - "API endpoints"
Cohesion: 0.33
Nodes (9): dynamic, GET(), getOfficeForOfficeHr(), normalizeDays(), normalizeNonNegativeInteger(), normalizeTime(), resolveOfficeHrSession(), validateOfficeHrSettings() (+1 more)

### Community 64 - "Biometric engine"
Cohesion: 0.31
Nodes (9): findPhaseRotation(), GUIDED_CAPTURE_CENTER_YAW_MAX, GUIDED_CAPTURE_CHIN_DOWN_PITCH_MIN, GUIDED_CAPTURE_SIDE_YAW_MIN, hasOppositeYaw(), normalizeRotation(), REQUIRED_GUIDED_PHASE_IDS, toFiniteNumber() (+1 more)

### Community 65 - "PostgreSQL storage"
Cohesion: 0.42
Nodes (9): deleteLocalEnrollmentPhoto(), extensionForContentType(), getEnrollmentPhotoDir(), getLocalFileStorageRoot(), getReadableStorageRoots(), parseDataUrl(), readLocalEnrollmentPhoto(), resolvePhotoPath() (+1 more)

### Community 66 - "API endpoints"
Cohesion: 0.36
Nodes (7): dynamic, POST(), runtime, consumeAttendanceChallenge(), issueAttendanceChallenge(), sanitizeContext(), warmServerAttendanceEmbedding()

### Community 67 - "Admin components"
Cohesion: 0.36
Nodes (8): ACTION_OPTIONS, AttendanceOverrideModal(), fetchLogs(), handleAdd(), handleDelete(), handleFieldDutyReview(), buildManilaTimestamp(), formatTimestamp()

### Community 68 - "Regression tests"
Cohesion: 0.31
Nodes (5): ensureJsExtension(), importLocalModule(), projectRootUrl, resolveImportSpecifier(), rewriteModuleSpecifiers()

### Community 69 - "PostgreSQL storage"
Cohesion: 0.46
Nodes (7): writeLocalScanEvent(), roundMetric(), sanitizeServerTimings(), summarizeServerPerformance(), sumTimings(), toPlainObject(), writeScanEvent()

### Community 70 - "API endpoints"
Cohesion: 0.43
Nodes (5): dynamic, POST(), runtime, sanitizeText(), touchKioskDevice()

### Community 71 - "Application internals"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 74 - "Application internals"
Cohesion: 0.33
Nodes (5): centered, files, sheet, thin, workbook

### Community 75 - "Application internals"
Cohesion: 0.70
Nodes (4): AddToHomeScreenButton(), handleInstall(), isIosDevice(), isStandalone()

### Community 76 - "Application internals"
Cohesion: 0.40
Nodes (4): compilerOptions, baseUrl, ignoreDeprecations, paths

### Community 77 - "Application internals"
Cohesion: 0.40
Nodes (4): bytes, files, sheetXml, stylesXml

## Knowledge Gaps
- **275 isolated node(s):** `bytes`, `files`, `sheetXml`, `stylesXml`, `sheet` (+270 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolveAdminSession()` connect `API endpoints` to `API endpoints`, `API endpoints`, `PostgreSQL storage`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **Why does `refreshDailyRecord()` connect `API endpoints` to `API endpoints`, `API endpoints`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **What connects `bytes`, `files`, `sheetXml` to the rest of the system?**
  _275 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.06299603174603174 - nodes in this community are weakly interconnected._
- **Should `Biometric engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06836158192090395 - nodes in this community are weakly interconnected._
- **Should `API endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.10101010101010101 - nodes in this community are weakly interconnected._
- **Should `Biometric engine` be split into smaller, more focused modules?**
  _Cohesion score 0.07738095238095238 - nodes in this community are weakly interconnected._