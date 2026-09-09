# How to send scan problems for review

## Download the report already available

1. Sign in as Regional Admin.
2. Open the dashboard showing **Operations overview**.
3. Find **System diagnostics** and click **Open diagnostics**.
4. In **System maintenance**, choose **Today** and click **Refresh**.
5. Wait for the update to finish. If it says the refresh failed, the displayed
   report is old. Do not label it as today's new results.
6. Click **Export JSON**. This downloads a file named
   `maintenance-evidence-YYYY-MM-DD.json`.
7. Attach that file in our conversation. Say whether it came from local testing
   or the live website, and when the update was uploaded. Keep each day's file
   separately; before-and-after files help compare the changes.

Start with one day's report. **14 days** and **This month** are also available,
but only the newest 1,200 recorded events are analyzed. **Incomplete window**
means some records were left out. A complete window means all recorded events
in that period were loaded; it does not mean every attempted scan was recorded.

The file includes counts, failure groups, phone/browser groups, processing times,
and employee references for some repeated mismatches. It is a summary, not a
list of every failed attempt. It does not contain face photos, face vectors,
employee access codes or database passwords. It does contain internal employee
references and system information, so share it as an internal support file.
No full database backup or employee face records are needed for this first review.

## What it can tell us

- Which recorded failure groups increased or decreased.
- Whether particular phone/browser groups struggle more often.
- Whether recorded comparisons are slower than before.
- Which identifiable employee records have repeated recorded mismatches.
- Which application build generated the report, when that information is available.

These records describe the system's decisions. They cannot prove that every
accepted scan belonged to the right person. A wrong-person report still needs
human confirmation. They also cannot reveal missing visual details such as glare
or blur that were not measured or retained.

## Missing information found during this review

Some phone-side failures happen before attendance is submitted. For example,
`useVerificationBurst` can return no usable capture, and `useKioskLoop` then shows
**No reliable face match was found** and returns without sending a scan event.
The current summary therefore misses an important class of the reported problem.
Camera permissions, a closed page and lost connectivity can also prevent delivery.

Unexpected attendance service failures have a separate server error record and
an audit entry with a tracking reference. Those are not included in this scan
summary. Challenge rejection and early request rejection are also not guaranteed
to appear in it. Do not call this download a complete automatic error report.

The next reporting change should record bounded, best-effort phone-side failure
summaries and include safe server-error references in an admin download. Record
the time, failure step, reason, elapsed time, camera dimensions and available
quality measurements. Record an employee reference only when it is established;
an entered code is not proof of who stood in front of the camera. Exclude photos,
face vectors, access codes, precise location and arbitrary error text. Limit
submissions and isolate reporting failures so attendance cannot depend on them.
Any event sent by a phone must remain labelled as a phone report, not verified
server evidence. Network delivery can fail, so collection coverage needs an
explicit limitation rather than a promise to record every failure.

This reporting extension is **not included** in the saved scan-improvement changes.
The existing download can be used now for the information it already contains.

## Fixing a problem versus restoring the previous version

An occasional rejected scan can be investigated and fixed while normal attendance
continues. If an update stops attendance widely, records the wrong employee, or
loses records, restore the previous application version while investigating.
That keeps staff working; it does not replace fixing the cause. Preserve newly
recorded attendance. Do not restore an old database over newer attendance records.

## Git and upload location

The updated source is in:
`D:\projects\faceid\.worktrees\codex-release-1-hardening`
on branch `codex/release-1-hardening`.

`D:\projects\faceid` is still the older main checkout. Saving a Git commit does
not update that folder, create an upload package, publish to a remote repository,
or change the live site. Do not upload the entire working folder: local settings,
test data, logs, and persistent employee files are not application update files.
