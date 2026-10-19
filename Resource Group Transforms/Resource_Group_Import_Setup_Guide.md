# Resource Group Import — Setup Guide (One-Time)

This document covers the **one-time setup** for the ServiceNow Resource Group Import framework. After completing these steps, you will have a fully automated monthly pipeline ready to use. See the **Operations Guide** for monthly usage instructions.

**Modules Used:** SPM (Resource Management, Capacity Planning) and ITSM

---

## Configuration Reference

| Item | Value |
|---|---|
| **User lookup field** | `u_samaccountname` on `sys_user` |
| **Employee Profile table** | `sn_employee_profile` |
| **Resource group field** | `primary_resource_group` on `sn_employee_profile` |
| **Group role requirement** | Groups must have the `pps_resource` role |
| **Conflict handling** | Overwrite — CSV is source of truth |
| **Frequency** | Monthly |
| **SPM plugins** | `com.snc.resource_management`, `com.snc.capacity_management`, `com.snc.project_portfolio_suite` |

---

## What You're Building

A fully automated, **delta-based** Import Pipeline that processes the monthly CSV while preserving historical membership data:

### Delta-Based Architecture (No Mass Wipes)

In earlier versions of this pipeline, a pre-cleanup step wiped all memberships from `pps_resource` groups before every run. That approach is now **retired** so that:
- Historical group membership records and their original creation dates (`sys_created_on`) are preserved.
- Unchanged employees are left completely untouched.
- Employees who transfer to a new team have their old team membership cleanly removed and new membership added dynamically during the transform.

### Import Pipeline (Import Sets + 5 Transform Maps)

An Import Set with five chained Transform Maps that process the CSV in order:

| Run Order | Transform Map | Target Table | Purpose |
|---|---|---|---|
| **100** | `RG Import - 1 - Create Groups` | `sys_user_group` | Creates groups that don't exist |
| **200** | `RG Import - 2 - Assign Role` | `sys_group_has_role` | Assigns `pps_resource` role to each group |
| **250** | `RG Import - 2.5 - Update User Schedule and FTE` | `sys_user` | Assigns schedules and user-level FTE from the CSV |
| **300** | `RG Import - 3 - Create Memberships` | `sys_user_grmember` | Manages memberships with delta cleanup (removes old group only on transfer) |
| **400** | `RG Import - 4 - Set Employee Profile` | `sn_employee_profile` | Sets `primary_resource_group` reference |

---

## Prerequisites

Before starting setup, verify the following:

### 1. The `pps_resource` role exists

- Navigate to **User Administration → Roles**
- Search for `pps_resource`
- Confirm it exists and note its `sys_id`

### 2. The `primary_resource_group` field exists on `sn_employee_profile`

- Navigate to an Employee Profile record
- Confirm the `primary_resource_group` field is present on the form
- If not visible, add it via **Configure → Form Layout**

### 3. You have a sample CSV for testing

- Prepare a small CSV (5–10 rows) with the two columns: **SAM Account Name** and **Capacity Team**
- Verify the SAM Account Names resolve in `sys_user` by searching **User Administration → Users** by `u_samaccountname`

### 4. Backups

Export the current state of these tables (**list view → Export → CSV**):
- `sys_user_group`
- `sys_group_has_role`
- `sys_user_grmember`
- `sn_employee_profile` (at minimum the `user` and `primary_resource_group` columns)

---

## Step 1: Deactivate Blanket Pre-Cleanup (Preserve History)

In earlier versions of this setup, a pre-cleanup step (either via Flow Designer or a Fix Script) was used to wipe all user memberships from all `pps_resource` groups prior to running the import. 

**That blanket wipe is now retired and must be deactivated.** 

### Why Blanket Cleanup Was Retired
- **Destroys Membership History:** Mass-deleting memberships resets `sys_created_on` timestamps every month, wiping out records of how long employees have belonged to their capacity teams.
- **Unnecessary Churn:** 90%+ of employees stay in the same team month-over-month. Deleting and re-adding them generates tens of thousands of audit records and risks temporary permission drops.
- **Handled by Delta Transforms:** Group cleanup is now handled dynamically on a per-user basis in **Transform Map #3 (Step 6)**. If an employee transfers to a new team, their old membership is cleanly removed during the transform while untouched employees are left completely preserved.

### Actions Required:

1. **If you previously created the Flow Designer Flow (`RG Import - Pre-Cleanup`):**
   - Navigate to **Process Automation → Flow Designer**.
   - Open `RG Import - Pre-Cleanup`.
   - Click **Deactivate** at the top right.
   
2. **If you previously created the Fix Script (`RG Import - Pre-Cleanup`):**
   - Do **NOT** run the Fix Script before monthly imports. (You may leave it inactive or delete it).

---

## Step 2: Set Up the Import Set Staging Table

The staging table `Primary_resource_group_updates` is used to hold the CSV data before it is transformed. It needs five columns: SAM Account Name, Capacity Team, Role, Schedule, and FTE Hours.

### 2.1 — Load the CSV

1. Navigate to **System Import Sets → Load Data**
2. Configure:
   - **Import Set Table:** Select the existing table `Primary_resource_group_updates`
   - **Source of Import:** File
   - **File:** Upload your CSV
3. Click **Submit**

### 2.2 — Add the Role, Schedule, and FTE Hours Columns (If Not Already Present)

If the staging table was originally created with only two columns (SAM Account Name and Capacity Team), you need to add the Role, Schedule, and FTE Hours columns manually:

1. Navigate to **System Definition → Tables**
2. Search for `Primary_resource_group_updates`
3. Open the table record
4. Go to the **Columns** related list
5. Click **New**
6. Fill in:
   - **Column label:** `Role`
   - **Type:** `String`
   - **Max length:** `100`
7. **Save** — ServiceNow will auto-generate the column name (e.g., `u_role`)
8. Click **New** again
9. Fill in:
   - **Column label:** `Schedule`
   - **Type:** `String`
   - **Max length:** `100`
10. **Save** — ServiceNow will auto-generate the column name (e.g., `u_schedule`)
11. Click **New** again
12. Fill in:
    - **Column label:** `FTE Hours`
    - **Type:** `Decimal`
13. **Save** — ServiceNow will auto-generate the column name (e.g., `u_fte_hours`)

### 2.3 — Verify the Staging Table

1. Open the staging table and confirm:
   - The five columns are present: `u_sam_account_name`, `u_capacity_planning`, `u_role`, `u_schedule`, and `u_fte_hours`
   - Data is loaded correctly
   - Import Set State = `Loaded`

> [!IMPORTANT]
> Note the **exact column names** — you'll reference them in the Transform Map field mappings. The names may vary based on your CSV headers (e.g., `u_sam_account_name` vs `u_samaccountname`).

> [!IMPORTANT]
> **Do NOT run the transform yet.** Create all five Transform Maps first.

---

## Step 3: Create Transform Map #1 — Create Groups

### 3.1 — Create the Transform Map

1. Navigate to **System Import Sets → Transform Maps**
2. Click **New**
3. Fill in:
   - **Name:** `RG Import - 1 - Create Groups`
   - **Source table:** `Primary_resource_group_updates`
   - **Target table:** `sys_user_group`
   - **Active:**  checked
   - **Run order:** `100`
4. **Save**

### 3.2 — Add Field Mapping: Group Name

Click **New** in the **Field Maps** related list:

| Setting | Value |
|---|---|
| **Source field** | `u_capacity_planning` |
| **Target field** | `name` |
| **Coalesce** |  **Yes** |
| **Choice action** | `reject` |

**Save** the field map.

### 3.3 — (Optional) Add Field Mapping: Description

| Setting | Value |
|---|---|
| **Source field** | (none — use **Choice action: set default value**) |
| **Target field** | `description` |
| **Coalesce** | No |
| **Default value** | `Auto-created from monthly CSV import` |

**Save** the field map.

---

## Step 4: Create Transform Map #2 — Assign pps_resource Role

### 4.1 — Create the Transform Map

1. Navigate to **System Import Sets → Transform Maps**
2. Click **New**
3. Fill in:
   - **Name:** `RG Import - 2 - Assign Role`
   - **Source table:** `Primary_resource_group_updates`
   - **Target table:** `sys_group_has_role`
   - **Active:**  checked
   - **Run order:** `200`
4. **Save**

### 4.2 — Add Field Mapping: Group Reference

| Setting | Value |
|---|---|
| **Source field** | `u_capacity_planning` |
| **Target field** | `group` |
| **Coalesce** |  **Yes** |
| **Reference value** | `name` |
| **Choice action** | `reject` |

**Save** the field map.

### 4.3 — Add Field Mapping: Role Reference

| Setting | Value |
|---|---|
| **Source field** | `u_role` |
| **Target field** | `role` |
| **Coalesce** |  **No** |
| **Reference value** | `name` |
| **Choice action** | `reject` |

**Save** the field map.

### 4.4 — Add an onBefore Script to Prevent Duplicate Errors

Because ServiceNow often hides system-managed fields like `inherits`, the safest and most standard way to prevent the "duplicate target records" error is a simple `onBefore` script that bypasses Coalesce altogether.

1. In your Transform Map's **Field Maps** list, open both the `group` and `role` mappings and **uncheck Coalesce** on both.
2. Go to the **Transform Scripts** related list and click **New**.
3. Set **When** to `onBefore`.
4. Paste the following script:

```javascript
(function runTransformScript(source, map, log, target /*undefined onStart*/ ) {
    
    var groupID = target.group;
    var roleID = target.role;
    
    if (groupID && roleID) {
        var ghr = new GlideRecord('sys_group_has_role');
        ghr.addQuery('group', groupID);
        ghr.addQuery('role', roleID);
        ghr.query();
        
        if (ghr.hasNext()) {
            // Group already has this role. Skip to prevent errors.
            ignore = true;
        }
    } else {
        ignore = true;
    }

})(source, map, log, target);
```
5. **Submit**.

> [!TIP]
> **Why do we need this script?** Since we turned off Coalesce, the system treats every row as an insert. This robust script checks if the group already has the role. If it does, it skips the insert (`ignore = true`). This bypasses the multi-record error entirely and cleanly skips groups that already have the role.

> [!NOTE]
> The `u_role` column comes from the **Role** column in your CSV, which should contain `pps_resource` in every row. The Reference value `name` tells ServiceNow to look up the role by its name and resolve it to the `sys_user_role` record.

---

## Step 5: Create Transform Map #2.5 — Update User Schedule and FTE

### 5.1 — Create the Transform Map

1. Navigate to **System Import Sets → Transform Maps**
2. Click **New**
3. Fill in:
   - **Name:** `RG Import - 2.5 - Update User Schedule and FTE`
   - **Source table:** `Primary_resource_group_updates`
   - **Target table:** `sys_user`
   - **Active:**  checked
   - **Run order:** `250`
4. **Save**

### 5.2 — Add Field Mapping: User Lookup (Coalesce)

Click **New** in the **Field Maps** related list:

| Setting | Value |
|---|---|
| **Source field** | `u_sam_account_name` |
| **Target field** | `u_samaccountname` |
| **Coalesce** |  **Yes** |
| **Choice action** | `reject` (Enforces that we only update existing users; does not create new user accounts) |

**Save** the field map.

### 5.3 — Add Field Mapping: Work Schedule

This maps the standard company working schedule directly from the CSV column to the user record.

Click **New** in the **Field Maps** related list:

| Setting | Value |
|---|---|
| **Source field** | `u_schedule` |
| **Target field** | `schedule` |
| **Referenced value field** | `name` |
| **Choice action** | `reject` (Enforces strict data quality; if you type the calendar name wrong in the CSV, it rejects the record) |

**Save** the field map.

### 5.4 — Add Field Mapping: Average Daily FTE Hours

This maps the standard workday capacity duration (hours per person-day) directly from the CSV column to the resource user profile.

Click **New** in the **Field Maps** related list:

| Setting | Value |
|---|---|
| **Source field** | `u_fte_hours` |
| **Target field** | `average_daily_fte` |

**Save** the field map.

---

## Step 6: Create Transform Map #3 — Create Memberships

### 6.1 — Create the Transform Map

1. Navigate to **System Import Sets → Transform Maps**
2. Click **New**
3. Fill in:
   - **Name:** `RG Import - 3 - Create Memberships`
   - **Source table:** `Primary_resource_group_updates`
   - **Target table:** `sys_user_grmember`
   - **Active:**  checked
   - **Run order:** `300`
4. **Save**

### 6.2 — Add Field Mapping: User Reference

| Setting | Value |
|---|---|
| **Source field** | `u_sam_account_name` |
| **Target field** | `user` |
| **Coalesce** |  **Yes** |
| **Reference value** | `u_samaccountname` |
| **Choice action** | `reject` |

**Save** the field map.

### 6.3 — Add Field Mapping: Group Reference

| Setting | Value |
|---|---|
| **Source field** | `u_capacity_planning` |
| **Target field** | `group` |
| **Coalesce** |  **Yes** |
| **Reference value** | `name` |
| **Choice action** | `reject` |

**Save** the field map.

### 6.4 — Add onBefore Script for Delta Team Transfers

Because both **User** and **Group** coalesce, ServiceNow natively matches existing memberships and leaves them untouched (preserving their original `sys_created_on` timestamps and history). 

However, if an employee transfers to a **new** team, ServiceNow would find no match for `(User, New Group)` and insert the new membership—leaving their **old** team membership behind. 

To ensure transferring employees are cleanly removed from their previous capacity team without affecting unchanged employees, add this lightweight `onBefore` script:

1. Scroll down to the **Transform Scripts** related list on Transform Map #3 (`RG Import - 3 - Create Memberships`).
2. Click **New**.
3. Set **When** to `onBefore`.
4. Paste the following script:

```javascript
(function runTransformScript(source, map, log, target /*undefined onStart*/ ) {
    var sam = (source.u_sam_account_name || '').toString().trim();
    var newGroupName = (source.u_capacity_planning || '').toString().trim();

    if (!sam || !newGroupName) {
        return;
    }

    // Look up the user's current team from their Employee Profile
    var prof = new GlideRecord('sn_employee_profile');
    prof.addQuery('user.u_samaccountname', sam);
    prof.query();
    
    if (prof.next()) {
        var oldGroup = prof.getValue('primary_resource_group');
        var oldGroupName = prof.primary_resource_group.getDisplayValue();

        // If they have an existing team and it differs from the incoming CSV team, remove the old membership
        if (oldGroup && oldGroupName != newGroupName) {
            var oldMem = new GlideRecord('sys_user_grmember');
            oldMem.addQuery('user', prof.getValue('user'));
            oldMem.addQuery('group', oldGroup);
            oldMem.deleteMultiple();
            log.info('RG Import #3: Transferred user ' + sam + ' from old group ' + oldGroupName + ' to ' + newGroupName);
        }
    }
})(source, map, log, target);
```
5. Click **Submit**.

> [!TIP]
> **How this works during import:**
> - **Employee stays on the same team:** The script detects the team has not changed and does nothing. ServiceNow's coalesce matches the existing `sys_user_grmember` record, keeping its original creation date and history 100% intact.
> - **Employee transfers to a new team:** The script deletes the user's old team membership, and the transform inserts the new one.
> - **New employee joining for the first time:** No old group exists, so the transform cleanly inserts the new membership.

---

## Step 7: Create Transform Map #4 — Set Employee Profile

### 7.1 — Create the Transform Map

1. Navigate to **System Import Sets → Transform Maps**
2. Click **New**
3. Fill in:
   - **Name:** `RG Import - 4 - Set Employee Profile`
   - **Source table:** `Primary_resource_group_updates`
   - **Target table:** `sn_employee_profile`
   - **Active:**  checked
   - **Run order:** `400`
4. **Save**

### 7.2 — Add Field Mapping: User Reference (Coalesce)

| Setting | Value |
|---|---|
| **Source field** | `u_sam_account_name` |
| **Target field** | `user` (or whatever the user reference field is named on `sn_employee_profile`) |
| **Coalesce** |  **Yes** |
| **Reference value** | `u_samaccountname` |
| **Choice action** | `reject` |

**Save** the field map.

### 7.3 — Add Field Mapping: Resource Group

| Setting | Value |
|---|---|
| **Source field** | `u_capacity_planning` |
| **Target field** | `primary_resource_group` |
| **Coalesce** | No |
| **Reference value** | `name` |
| **Choice action** | `reject` |

**Save** the field map.

---

## Step 8: Test the Full Pipeline

Now that everything is built, test the pipeline using a small sample CSV containing three test cases:

| Test Case | Sample Data Setup | Expected Result |
|---|---|---|
| **1. Unchanged User** | User already belongs to "Network Operations" in their Employee Profile; CSV has "Network Operations" | Matched via coalesce. **Existing `sys_user_grmember` record untouched; `sys_created_on` date preserved.** |
| **2. Transferred User** | User currently in "Network Operations" in Employee Profile; CSV has "Cloud Infrastructure" | Old membership in "Network Operations" is deleted; new membership in "Cloud Infrastructure" inserted; Profile updated. |
| **3. New User** | User has no capacity team assigned on Employee Profile; CSV has "Security Response" | New membership in "Security Response" inserted; Profile updated. |

### 8.1 — Run the Test Import

1. Navigate to **System Import Sets → Load Data**.
2. Select `Primary_resource_group_updates`, upload your test CSV, and submit.
3. On the Import Set record (State = `Loaded`), click **Transform**.
4. Run all 5 maps in order.

### 8.2 — Review Results by Transform Map

| Transform Map | Expected Result |
|---|---|
| #1 - Create Groups | New groups inserted, existing ones matched |
| #2 - Assign Role | `pps_resource` role assigned to new groups |
| #2.5 - Update User Schedule/FTE | User schedule and FTE updated |
| #3 - Create Memberships | Transferred users moved (old group deleted, new group inserted); unchanged users matched via coalesce (untouched) |
| #4 - Set Employee Profile | `primary_resource_group` updated on `sn_employee_profile` |

### 8.3 — Verify in ServiceNow

1. **Verify Unchanged User:**
   - Open the user record in `sys_user` → go to the **Groups** related list.
   - Confirm the user is in the group.
   - Right-click the list header → **Configure → List Layout** and ensure `Created` (`sys_created_on`) is visible. Confirm the timestamp was **not** reset to today's date.
2. **Verify Transferred User:**
   - Confirm the user was removed from their old group and only belongs to their new capacity team.
   - Check `sn_employee_profile` → confirm `primary_resource_group` shows the new group.
3. **Verify System Logs:**
   - Navigate to **System Logs → System Log → Application Logs** (or All).
   - Filter for messages starting with `RG Import #3:`. You will see explicit logs confirming any transferred users removed from their old groups.

---

## Step 9: Set Up Monthly Automation

### 9.1 — Create a Data Source

1. Navigate to **System Import Sets → Administration → Data Sources**
2. Click **New**
3. Fill in:
   - **Name:** `Monthly Resource Group CSV`
   - **Import set table:** `Primary_resource_group_updates`
   - **Type:** `File` (or `SFTP` / `Attachment` depending on how the CSV will be delivered)
4. **Save**

> [!TIP]
> **File delivery options:**
> - **Manual upload:** Someone uploads the CSV each month to the Data Source
> - **SFTP/FTP:** CSV dropped on a file server, Data Source pulls from there
> - **Mid Server:** File on an internal network share, fetched via Mid Server
> - **Email attachment:** Inbound email action to receive the CSV

### 9.2 — Create a Scheduled Import

1. Navigate to **System Import Sets → Administration → Scheduled Imports**
2. Click **New**
3. Fill in:
   - **Name:** `Monthly Resource Group Import`
   - **Data source:** `Monthly Resource Group CSV`
   - **Run:** `Monthly` (e.g., 1st of each month at 2:00 AM)
   - **Run Transform:**  **Checked** — because delta cleanup is handled inside the transform maps, the scheduled import can transform immediately upon loading.
   - **Active:**  checked
4. **Save**

### 9.3 — (Optional) Set Up Email Notifications

1. Navigate to **System Notification → Email → Notifications**
2. Create a notification triggered on the Import Set table when State changes to `Complete` or `Error`
3. Send to the Resource Management team or import owner

---

## Step 10: Activate

Once testing is verified:

1. **Ensure Cleanup Flow is Deactivated** — In Flow Designer, verify `RG Import - Pre-Cleanup` is **Inactive**.
2. **Activate the Scheduled Import** — Ensure `Active` is checked on `Monthly Resource Group Import`.
3. No external timing coordination is required.

---

## Setup Complete 

You now have the following components ready:

| Component | Type | Purpose |
|---|---|---|
| `RG Import - Pre-Cleanup` | Flow / Fix Script | **Deactivated / Retired** (Delta cleanup now handled dynamically in Map #3) |
| `Primary_resource_group_updates` | Staging Table | Holds CSV data |
| `RG Import - 1 - Create Groups` | Transform Map | Creates missing `sys_user_group` records |
| `RG Import - 2 - Assign Role` | Transform Map | Assigns `pps_resource` role to groups |
| `RG Import - 2.5 - Update User Schedule and FTE` | Transform Map | Automatically assigns default schedules and user-level FTE overrides |
| `RG Import - 3 - Create Memberships` | Transform Map | Manages memberships: preserves history for unchanged users, cleans up old group for transfers |
| `RG Import - 4 - Set Employee Profile` | Transform Map | Sets `primary_resource_group` on `sn_employee_profile` |
| `Monthly Resource Group CSV` | Data Source | Receives the monthly CSV file |
| `Monthly Resource Group Import` | Scheduled Import | Automatically loads CSV and runs the delta transforms |

**Next:** Refer to the **Operations Guide** for monthly usage instructions.

---

## Important Warnings

> [!WARNING]
> **Coalesce is case-sensitive.** If the CSV has `"Network Ops"` but ServiceNow has `"network ops"`, a duplicate group will be created. Always normalize CSV casing before import.

> [!NOTE]
> **Employees Absent from CSV:** The delta transform updates employees listed in the CSV. If an employee departs or is completely removed from the monthly CSV without being placed in another team, their existing group membership remains until they are offboarded or updated manually.
