# Resource Group Import — Monthly Operations Guide

This document covers **how to use** the Resource Group Import framework each month. For the one-time infrastructure setup, see the **Setup Guide**.

---

## Quick Reference

| Item | Value |
|---|---|
| **Delta Cleanup** | Dynamic cleanup in Transform Map #3 — removes old group membership only when employee transfers teams |
| **Scheduled Import** | `Monthly Resource Group Import` — loads CSV data and executes delta transforms automatically |
| **Staging table** | `Primary_resource_group_updates` |
| **CSV columns** | SAM Account Name, Capacity Team, Role, Schedule, FTE Hours |
| **User lookup** | `u_samaccountname` on `sys_user` |
| **Employee Profile table** | `sn_employee_profile` |
| **Resource group field** | `primary_resource_group` |

---

## Monthly Checklist

Print or copy this checklist each month:

```
□ 1. CSV received from source
□ 2. CSV validated (see Section 1)
□ 3. CSV uploaded to Data Source (see Section 2)
□ 4. Import completed — transform results reviewed (see Section 3 & 4)
□ 5. Errors investigated and remediated (see Section 5)
□ 6. Spot-check 3–5 users in ServiceNow (see Section 6)
□ 7. Verified in SPM Resource Management views (see Section 6)
□ 8. Generate Resource Capacity job run manually (see Section 7)
□ Done — results communicated to stakeholders
```

---

## 1. Validate the CSV

Before uploading, check the CSV for data quality issues.

### Required Format

The CSV must have the standard columns (at minimum SAM Account Name and Capacity Team; plus Role, Schedule, and FTE Hours if using schedules):

```csv
SAM Account Name,Capacity Team,Role,Schedule,FTE Hours
jsmith,Network Operations,pps_resource,8-5 weekdays,8
jdoe,Cloud Infrastructure,pps_resource,8-5 weekdays,8
mbrown,Security Response,pps_resource,8-5 weekdays,8
...
```

> [!NOTE]
> The **Role** column must contain `pps_resource` in every row. This is used by Transform Map #2 to assign the role to each group. In Excel, type it once and fill down all rows.

### Validation Checks

| Check | Why It Matters | How to Fix |
|---|---|---|
| **No blank values** in key columns | Blank SAM Account Names → errors. Blank Capacity Teams → unnamed groups created. | Remove or fill in blank rows before upload |
| **No leading/trailing whitespace** | `" Network Ops"` and `"Network Ops"` would create two separate groups | Trim all values in Excel or your CSV editor |
| **Consistent casing** on Capacity Team names | `"Network Ops"` vs `"network ops"` creates duplicate groups (coalesce is case-sensitive) | Normalize to a consistent case (e.g., Title Case) |
| **SAM Account Names are valid** | Typos or deprovisioned accounts will fail during import | Spot-check 5–10 names against ServiceNow if source data is unreliable |
| **File encoding is UTF-8** | Non-UTF-8 encoding can corrupt special characters | Save as UTF-8 CSV from Excel: **File → Save As → CSV UTF-8** |

> [!TIP]
> **Quick validation in Excel:**
> 1. Sort the Capacity Team column → visually scan for near-duplicates and case mismatches
> 2. Filter for blanks in both columns
> 3. Use `=TRIM()` to clean whitespace
> 4. Use `=PROPER()` to normalize to Title Case

---

## 2. Upload the CSV

### If Using Manual Upload

1. Navigate to **System Import Sets → Administration → Data Sources**
2. Open `Monthly Resource Group CSV`
3. Upload the new CSV file as an attachment (or replace the existing file)
4. The Scheduled Import will pick it up at the scheduled time

### If Using SFTP/FTP

1. Drop the CSV file to the configured SFTP location
2. Ensure the filename matches what the Data Source expects
3. The Data Source will pull the file at the scheduled time

### If Running Manually (Not Waiting for Schedule)

1. Navigate to **System Import Sets → Load Data**
2. Select the existing table: `Primary_resource_group_updates`
3. Upload the CSV and submit
4. On the resulting screen or Import Set, click **Transform** to run the 5 transform maps

---

## 3. Understanding Delta Updates (No Blanket Wipe)

In earlier versions of this process, a pre-cleanup step wiped all memberships from `pps_resource` groups. **That blanket wipe has been retired to preserve historical data.**

### How Delta Updates Work:
1. **Unchanged Employees (Same Team):**
   - The CSV group matches the employee's current `primary_resource_group` on their `sn_employee_profile`.
   - ServiceNow's coalesce matches their existing `sys_user_grmember` record.
   - **No records are deleted or re-inserted.** Their original group membership creation date (`sys_created_on`) and historical audit trail remain completely untouched.
2. **Transferring Employees (New Team):**
   - The CSV group differs from their current `primary_resource_group` on `sn_employee_profile`.
   - The `onBefore` script in Transform Map #3 removes the employee from their **old** group.
   - Transform Map #3 inserts the employee into their **new** group.
   - Transform Map #4 updates their `sn_employee_profile.primary_resource_group`.
3. **New Employees:**
   - The employee has no prior capacity team on `sn_employee_profile`.
   - Transform Map #3 inserts them into the new group, and Transform Map #4 sets their profile.

---

## 4. Monitor the Import

If running manually or inspecting a scheduled run:

### Manual Trigger

1. Navigate to **System Import Sets → Import Sets**
2. Open the Import Set (State = `Loaded`)
3. Click **Transform**

### Review Transform Results

After completion, ServiceNow shows a summary for each Transform Map. Here's what to expect:

#### Transform Map #1 — Create Groups

```
Inserts: [small number — only new groups]
Updates: [most rows — existing groups matched]
Errors:  0
```

- **First import:** All groups will be inserts
- **Subsequent months:** Mostly updates (skips), with inserts only for brand-new capacity teams

#### Transform Map #2 — Assign Role

```
Inserts: [same as #1 inserts — new groups need roles]
Updates: [same as #1 updates — role already assigned]
Errors:  0
```

- Should mirror Transform Map #1 counts exactly

#### Transform Map #3 — Create Memberships

```
Inserts: [small number — only new employees and employees who transferred to a new team]
Updates: [most rows — unchanged employees matched via coalesce]
Errors:  [users not found by u_samaccountname]
```

- **Unchanged employees:** Show as **Updates** because their existing membership record was matched via coalesce and left untouched, preserving their original creation timestamp.
- **Transferred & new employees:** Show as **Inserts** because a new group membership was created (transferred employees had their old group deleted by the `onBefore` script).
- **Error count:** Users whose SAM Account Name doesn't match any `sys_user` record.

#### Transform Map #4 — Set Employee Profile

```
Inserts: [small number — only users without prior Employee Profiles]
Updates: [most rows — profile exists and primary_resource_group is maintained/updated]
Errors:  [same as #3 errors]
```

- Should be predominantly updates
- Error count should match Transform Map #3's error count

### Red Flags

| Symptom | Likely Cause |
|---|---|
| Transform Map #1 has many inserts when few are expected | Case mismatch creating duplicate groups — check CSV casing |
| Transform Map #3 has high error count | SAM Account Names don't match `sys_user.u_samaccountname` — check CSV data |
| Transform Map #4 has more errors than #3 | Some users don't have Employee Profile records in `sn_employee_profile` |
| An employee who transferred still has their old group | Transform Script in Map #3 may be inactive or `primary_resource_group` on their profile was empty before the run |

---

## 5. Investigate Errors

### View Error Details

1. Navigate to **System Import Sets → Import Sets**
2. Open your Import Set
3. Go to the **Import Set Rows** related list
4. Filter by **State = Error**
5. Open each errored row — the **Error message** field explains the failure

### Common Errors and Fixes

| Error Message | Cause | Resolution |
|---|---|---|
| `No matching record found for u_samaccountname = [value]` | User doesn't exist in ServiceNow | Verify the SAM Account Name is correct; create the user first if needed |
| `No matching record found for name = [value]` | Group wasn't created by Transform Map #1 | Check if the Capacity Team column has a typo or blank value |
| `Coalesce values not found` | Reference lookup failed | Check the Reference Value setting on the field mapping |

### Re-Import Failed Rows

If you fix the underlying issue (e.g., correct a SAM Account Name):

1. Create a small CSV with just the corrected rows
2. Navigate to **System Import Sets → Load Data**
3. Upload to the same staging table
4. Run the transform — only the new rows will be processed

---

## 6. Verify Results

### Spot-Check Records (Do This Every Month)

Pick **3–5 users** at random from the CSV. For each user:

1. **User record:**
   - Navigate to **User Administration → Users**
   - Search by `u_samaccountname`
   - Open the user → check the **Groups** related list
   -  Verify the correct Capacity Team group appears
   -  Verify **no duplicate capacity teams** (only their current capacity team should be listed under pps_resource groups)
   -  **Verify Creation Timestamp:** Ensure `Created` (`sys_created_on`) was **not** updated to today's date for unchanged employees.

2. **Group record:**
   - Open the Capacity Team group
   - Check the **Roles** related list
   -  Verify `pps_resource` role is assigned

3. **Employee Profile:**
   - Navigate to the user's Employee Profile (`sn_employee_profile`)
   -  Verify `primary_resource_group` shows the correct Capacity Team

4. **SPM views:**
   - Navigate to **Resource Management** in the SPM module
   -  Verify the user appears under their assigned capacity team

### Verify Users Who Changed Teams

If you know specific users changed capacity teams this month:

-  Confirm they are **only** in their new group (the old group was removed)
-  Confirm `primary_resource_group` on their Employee Profile shows the **new** team

### Count Validation

| Check | Where to Verify | Expected |
|---|---|---|
| Groups created | Transform Map #1 results | Only new teams |
| Roles assigned | Transform Map #2 results | Matches #1 |
| Memberships updated | Transform Map #3 results | Most rows (unchanged employees) |
| Memberships created | Transform Map #3 results | Small count (new users + transferred users) |
| Profiles updated | Transform Map #4 results | Matches total valid rows |
| Errors (total) | Import Set Rows → State = Error | Consistent across #3 and #4 |

---

## 7. Generate Resource Capacity

After verifying the import results, manually run the capacity generation job to refresh SPM capacity data with the updated resource groups.

### Steps

1. Navigate to **System Definition → Scheduled Jobs**
2. Search for **"Generate Resource Capacity"**
3. Open the job record
4. Click **Execute Now**
5. Wait for the job to complete — check the **Last run** field to confirm it finished

### What This Does

- Recalculates capacity and availability for all resource groups
- Updates the data shown in **Resource Management** and **Capacity Planning** SPM views
- Ensures the newly imported/updated resource group assignments are reflected immediately

> [!NOTE]
> This job already runs weekly on its own schedule. Running it manually here ensures the capacity data is updated right away after the import rather than waiting for the next weekly run.

---

## 8. Communicate Results

After verification, share a brief summary with stakeholders:

```
Resource Group Monthly Import — [Month Year]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CSV rows processed:         [number]
New groups created:         [number]
Memberships maintained:     [number] (unchanged)
Memberships created/trans:  [number] (new or transferred)
Employee profiles updated:  [number]
Errors:                     [number] — [brief explanation]
Spot-check:                 Passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 9. Troubleshooting

### An employee transferred teams but is still in their old group

- Open Transform Map #3 (`RG Import - 3 - Create Memberships`)
- Check the **Transform Scripts** related list to verify the `onBefore` script is present and **Active**
- Check **System Logs → Application Logs** for `RG Import #3:` to see if the user lookup or group lookup failed
- Verify the employee's `sn_employee_profile` record actually had their old group populated in `primary_resource_group` before the run

### The import didn't pick up the new CSV

- Check the **Data Source** — is the new file attached?
- For SFTP: verify the file was delivered to the correct path with the expected filename
- **Manual workaround:** Upload CSV via **System Import Sets → Load Data** using the existing staging table

### Duplicate groups were created

- Likely a casing mismatch (e.g., `"Cloud Infra"` vs `"cloud infra"`)
- **Fix:** Delete the duplicate group, update the CSV to match the correct casing, re-run the import for affected rows

### Transform Map #4 creating inserts instead of updates

- The coalesce field mapping may not be matching correctly
- Verify the `user` field on `sn_employee_profile` is a reference to `sys_user`
- Verify the **Reference value** is set to `u_samaccountname`


