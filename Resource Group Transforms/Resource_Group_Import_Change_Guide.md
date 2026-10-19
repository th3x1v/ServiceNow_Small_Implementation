# Resource Group Import — Migration to Delta Updates

This guide provides a direct checklist of the exact changes you need to make in your ServiceNow instance to switch from the old blanket pre-cleanup process to the **delta-based process**.

---

## Executive Summary: What is Changing?

| Component | Old Behavior | New Behavior | Action Needed |
|---|---|---|---|
| **Cleanup Flow** | Deleted ALL users from all `pps_resource` groups every month | **Retired.** Group memberships are no longer wiped. | **Deactivate** the Flow in Flow Designer |
| **Transform Map #3** (`sys_user_grmember`) | Re-inserted all users after the wipe | Unchanged users are left untouched (history preserved); transferring users have old team removed and new team added | **Add 1 `onBefore` Transform Script** |
| **Scheduled Import** | "Run Transform" unchecked (waited on flow) | "Run Transform" **checked** (runs directly upon load) | **Check 1 box** |
| **Transform Maps #1, #2, #2.5, #4** | Unchanged | Unchanged | **No changes needed** |

---

## Step 1: Deactivate the Pre-Cleanup Flow

Stop the system from mass-deleting group memberships before imports:

1. Navigate to **Process Automation → Flow Designer**.
2. Search for and open **`RG Import - Pre-Cleanup`**.
3. In the upper right corner, click **Deactivate**.
4. Confirm deactivation when prompted.

> [!NOTE]
> If you previously used the manual Fix Script instead of the Flow, simply do **not** run the Fix Script before your next import.

---

## Step 2: Add the Delta Script to Transform Map #3

This script checks `sn_employee_profile`. If an employee moved to a new capacity team, it removes their old team membership before adding the new one. If they did not move, it leaves them untouched.

### 2.1 — Verify Coalesce Settings
1. Navigate to **System Import Sets → Transform Maps**.
2. Open **`RG Import - 3 - Create Memberships`**.
3. Scroll to the **Field Maps** related list at the bottom and confirm:
   - `u_sam_account_name` → `user` has **Coalesce = true**
   - `u_capacity_planning` → `group` has **Coalesce = true**

### 2.2 — Add the onBefore Script
1. On the same Transform Map record, scroll down to the **Transform Scripts** related list.
2. Click **New**.
3. Fill in:
   - **When:** `onBefore`
   - **Active:** Checked
4. In the **Script** box, paste the following:

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

---

## Step 3: Update the Scheduled Import

Because you no longer need to wait for a cleanup flow to run, the Scheduled Import can execute the transform immediately:

1. Navigate to **System Import Sets → Administration → Scheduled Imports**.
2. Open **`Monthly Resource Group Import`**.
3. Check the **Run Transform** checkbox (`true`).
4. Click **Update** / **Save**.

---

## Step 4: Verification / Testing (Optional but Recommended)

Before running your full monthly production file, you can verify the behavior with a small 3-row test CSV:

### Test Data Example
```csv
SAM Account Name,Capacity Team,Role,Schedule,FTE Hours
jsmith,Network Operations,pps_resource,8-5 weekdays,8
bwhite,Cloud Infrastructure,pps_resource,8-5 weekdays,8
newuser,Security Response,pps_resource,8-5 weekdays,8
```
- **`jsmith` (Unchanged):** Already in "Network Operations" in ServiceNow.
- **`bwhite` (Transfer):** Currently in "Network Operations" in ServiceNow, moving to "Cloud Infrastructure".
- **`newuser` (New):** Has no current group.

### Expected Results After Transform:
1. **Unchanged User (`jsmith`):**
   - Check `sys_user` → **Groups** related list.
   - Look at the **Created** (`sys_created_on`) timestamp for "Network Operations". It will **not** be today's date—it preserves the original date they joined the group.
2. **Transferred User (`bwhite`):**
   - Removed from "Network Operations".
   - Now in "Cloud Infrastructure".
   - `sn_employee_profile` updated to "Cloud Infrastructure".
3. **System Logs:**
   - Navigate to **System Logs → System Log → Application Logs**.
   - Filter by Message contains `RG Import #3:`.
   - You will see: `RG Import #3: Transferred user bwhite from old group Network Operations to Cloud Infrastructure`.

---

## What Does NOT Need to Change

Everything else in your architecture remains exactly as-is:
- **Data Source:** `Monthly Resource Group CSV` (same setup)
- **Staging Table:** `Primary_resource_group_updates` (same fields)
- **Transform Map #1:** `RG Import - 1 - Create Groups` (no change)
- **Transform Map #2:** `RG Import - 2 - Assign Role` (no change)
- **Transform Map #2.5:** `RG Import - 2.5 - Update User Schedule and FTE` (no change)
- **Transform Map #4:** `RG Import - 4 - Set Employee Profile` (no change)
