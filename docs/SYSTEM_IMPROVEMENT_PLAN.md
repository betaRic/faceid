# System Improvement Plan

This document is the blunt internal review of the current FaceAttend system.

It exists to answer one question:

How do we improve speed, trust, and usability without rebuilding the same overcomplicated system that failed before?

## Core Principle

Do not add logic just because it sounds advanced.

Only add logic when it does at least one of these:
- reduces real mismatch risk
- reduces real operator confusion
- reduces real support burden
- improves reliability under normal office conditions
- makes the system easier to test and operate

Do not add logic if it mainly:
- creates more states to debug
- depends on constant client-server streaming
- adds too many knobs for admins
- makes the kiosk slower
- makes the behavior harder to explain to non-technical users

## Blunt Assessment Of The Current System

### What is already good

- One office per employee is correct.
- Admin transfer flow is correct.
- Server-side final attendance decision is a major improvement.
- Duplicate face blocking is correct.
- Inactive employee blocking is correct.
- Registration wizard is cleaner than the old one-screen enrollment form.
- Office map picker is better than raw coordinates as the main setup flow.
- Keeping live face detection on the client avoids the kiosk streaming failure pattern from the old system.

### What is still weak

- Biometric templates are still readable by the client.
- Attendance summary is still derived from heuristic interpretation of raw scans.
- Enrollment quality is suggested, but not operationally enforced.
- Admin authentication is still PIN-based, which is acceptable for pilot use but weak for long-term production.
- Firestore reads are still too open for a fully hardened model.
- Kiosk failure reasons are better than before, but still not operationally rich enough.

### What is unacceptable if the system grows carelessly

- Sending live video frames to the server continuously.
- Adding visitor mode.
- Adding device registration.
- Adding a giant biometric settings panel.
- Adding advanced anti-spoof tuning UI before the core product is stable.
- Adding too many approval states or exception branches.
- Treating admin UI as a technical control room instead of an operations tool.

## The Biggest Trust Gaps

### 1. Client-readable biometric templates

This is still the biggest architecture gap.

Current state:
- client detects face
- client loads enough biometric data to support local matching
- server makes final attendance decision from one submitted descriptor

This is acceptable for:
- dry run
- pilot
- controlled internal testing

This is not ideal for:
- hardened production biometric security

### 2. Attendance summary derivation

Current summary logic infers:
- AM IN
- AM OUT
- PM IN
- PM OUT
- late
- undertime
- working hours

This is useful, but still fragile around:
- missing scans
- lunch-edge scans
- repeated scans
- partial attendance days
- afternoon-only attendance

### 3. Enrollment readiness

The system allows a record to exist after a single good sample.

That is operationally risky because:
- one weak sample often leads to poor matching
- admins may assume the employee is already “fully enrolled”

This should be separated into:
- saved
- usable
- strong enrollment

## Highest-Value Quality Of Life Additions

These are the best next additions because they improve trust and usability without bloating the system.

### 1. Enrollment readiness state

Add a readiness classification per employee:
- `Needs samples`
- `Ready`
- `Weak enrollment`

Recommended rule:
- 1 sample: saved but not ready
- 2 samples: limited
- 3 or more good samples: ready

Optional improvement:
- measure descriptor spread so three near-identical weak captures do not count as “strong”

Why this matters:
- reduces false expectations
- makes registration quality visible
- gives admins a clear next action

### 2. Office setup completeness

Each office should show a setup health summary:
- GPS pin set
- radius set
- schedule set
- working days set
- WFH config set

Why this matters:
- many attendance failures are configuration failures, not biometric failures
- admins need quick visibility into what is incomplete

### 3. Attendance decision codes

Every attendance result should include a machine-readable outcome:
- `accepted_onsite`
- `accepted_wfh`
- `blocked_geofence`
- `blocked_inactive`
- `blocked_ambiguous_match`
- `blocked_no_reliable_match`
- `blocked_missing_office_config`
- `blocked_weak_face_quality`

Why this matters:
- easier troubleshooting
- easier reporting
- easier future analytics

### 4. Kiosk health strip

Add a compact live status strip:
- camera ready/offline
- AI ready/loading
- location ready/blocked
- server reachable/unreachable

Do not make this a diagnostics page.

Why this matters:
- prevents “the kiosk is stuck” confusion
- gives testers immediate visibility

### 5. Better kiosk feedback memory

If repeated failures happen, show the last meaningful reason clearly:
- `Too far from office location`
- `Face too weak`
- `Ambiguous match`
- `No reliable match`

Why this matters:
- users stop blindly retrying
- testers report better issues

### 6. Cooldown feedback

If someone just logged attendance moments ago, explicitly show:
- `Attendance already recorded recently`

Why this matters:
- makes the cooldown understandable
- avoids “why did nothing happen?” complaints

### 7. Effective-date transfers

Office transfers should eventually support:
- transfer date
- old office retained for historical logs
- new office used from the effective date

Do not build a huge transfer-history UI yet.

Why this matters:
- better audit behavior
- cleaner reporting

### 8. Server-generated daily attendance records

Keep raw logs.

Also generate a derived daily record per employee/date.

That daily record should store:
- AM IN
- AM OUT
- PM IN
- PM OUT
- late minutes
- undertime minutes
- working hours
- final daily status

Why this matters:
- reports become more stable
- less recalculation drift
- easier export and audit

### 9. Office holidays as a shared layer

If holidays are added, do this simply:
- one region-wide holiday list first
- optional office-specific overrides later only if really needed

Why this matters:
- avoids building a bloated calendar engine too early

### 10. Enrollment operator guidance

Add simple hints during registration:
- `Move closer`
- `Center face`
- `Need more sample variety`

Why this matters:
- better sample quality
- less silent failure

## Improvements That Are Tempting But Wrong Right Now

Do not add these now:

### Live frame streaming to server

This was already identified as a bad idea.

Why it is wrong:
- increases lag
- increases failure points
- recreates kiosk freeze problems
- adds network dependency to every scan

### Full server-side real-time video matching

Why it is wrong right now:
- too heavy
- too costly
- too complex for the current phase

### Visitor flow

Why it is wrong:
- adds an entirely different product branch
- distracts from employee attendance reliability

### Device registration and approval

Why it is wrong:
- adds extra identity states
- creates support burden
- not needed for kiosk-first dry run

### Heavy anti-spoof system

Why it is wrong:
- high complexity
- hard to tune
- current heuristic is enough for pilot use

### Admin mega-settings panel

Why it is wrong:
- too many runtime knobs
- weakens consistency
- increases support burden

## Hard Truths About Trust

These statements should remain true in planning:

- The system can be improved a lot without becoming bloated.
- The system cannot honestly be called mismatch-proof.
- The system should not claim biometric-grade security beyond what is implemented.
- The system will only become truly trusted after real field testing.
- Architecture discipline matters more than feature volume.

## Best Quality Of Life Pack

If only one next implementation pack is chosen, it should be this:

1. Enrollment readiness state
2. Office setup completeness indicators
3. Attendance decision codes
4. Kiosk health strip
5. Better kiosk failure feedback
6. Cooldown feedback
7. Server-generated daily attendance records

This is the best improvement bundle because it:
- improves trust
- improves supportability
- improves reporting
- does not overload the kiosk
- does not create a giant new subsystem

## Phased Plan

### Phase 1: Operational Clarity

Goal:
- make the system easier to operate and test

Implement:
- enrollment readiness state
- office setup completeness
- attendance decision codes
- kiosk health strip
- cooldown feedback

Expected impact:
- less tester confusion
- fewer support questions
- better operator confidence

### Phase 2: Reporting Stability

Goal:
- make attendance reporting more defensible

Implement:
- server-generated daily attendance records
- clearer incomplete-attendance handling
- decision-code-based report filtering
- export improvements

Expected impact:
- more stable daily summaries
- easier audit and export

### Phase 3: Data Hardening

Goal:
- reduce remaining trust gaps without breaking kiosk speed

Implement:
- reduce direct client access to sensitive biometric data
- move toward safer read patterns for biometric records
- tighten Firestore access gradually after read path changes

Expected impact:
- stronger security posture
- better separation of client and server trust

### Phase 4: Optional Policy Depth

Goal:
- add real-world policy support carefully

Implement only if needed:
- region-wide holiday calendar
- effective-date transfer logic
- office-specific overrides only if justified by real usage

Expected impact:
- better administrative realism without policy-engine bloat

## Implementation Guardrails

For every proposed new feature, ask:

1. Does it reduce a real failure mode?
2. Does it keep kiosk responsiveness intact?
3. Can a non-technical tester understand it immediately?
4. Can it be explained in one sentence?
5. Does it avoid creating multiple extra states to debug?

If the answer to most of those is no, do not add it.

## Recommendation

The system should continue improving through focused operational quality changes, not feature accumulation.

The right next move is not “more advanced biometrics.”

The right next move is:
- clearer operations
- better readiness signals
- better daily record generation
- stronger but still lean data trust boundaries

That path improves reliability and trust without rebuilding the failed architecture that came before.
