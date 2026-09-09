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
and employee references for some repeated server-side mismatches. It also includes
up to 500 recent phone failure reports in a separate `phoneReports` section.
Those phone reports have temporary page-session references, not employee names
or employee identity. They must not be added to the confirmed scan totals.
It does not contain face photos, face vectors,
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

## Automatic phone reports added in this update

The updated scanner automatically sends a small report when a started scan
cannot collect usable face frames, has too few ready frames, fails to process a
face, or cannot complete its attendance request. It also reports exceptions in
preview processing. Available details include the failure step, elapsed time,
camera dimensions and captured/ready-frame counts. These are observations from
the phone, not proof of the person's identity or an attendance result.

Reporting does not wait before showing the existing scan result. One retry is
allowed if delivery fails. Nothing is stored persistently on the phone. Reports
are deduplicated and retained for 14 days. Cleanup runs at startup and hourly,
at most 5,000 old rows per pass; a stopped site resumes cleanup on startup.

The server accepts at most 120 reports per network address per minute and 10,000
per day across the site. Existing trusted-proxy settings must supply a usable
address in production; reporting fails closed if they do not. These are separate
limits from attendance. A busy site or missing network information can leave
reports undelivered. No reporting failure changes attendance acceptance.

The Regional Admin download includes the newest 500 phone reports in the chosen
period (within the 14-day retention window). It says when more reports exist or
the report store is unavailable. Office-scoped users do not receive these reports
because the phone does not establish a trusted employee/office identity.

Initial camera permission failures, pages that never finish loading, ordinary
idle/no-face waiting before a scan starts, a closed page and lost connectivity
can still go unreported. This is not a promise to record every camera problem.

Unexpected attendance service failures have a separate server error record and
an audit entry with a tracking reference. When the scanner receives that reference,
its phone report preserves it. The internal server error text and audit entries
are not bundled in this download. Request failures may be recorded by the phone
even when no server scan event exists. Do not call this a complete error archive.

Deployment requires additive migration `0018_phone_scan_reports.sql` in addition
to the earlier reviewed migrations. Apply it to the intended database using the
normal migration process. Never run the test database reset on employee data.
Until that table exists, phone collection/export is unavailable; ordinary
attendance continues. Automatic face learning remains off.

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
