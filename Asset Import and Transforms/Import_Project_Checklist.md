# Resource Management Import - Setup Checklist (Schedule & FTE Configuration)

This checklist tracks your step-by-step progress for configuring programmatic work schedules and Average Daily FTE Hours (Hours per Person-Day) during your Resource imports. All standard import sets and basic mappings have been successfully vetted and are excluded.

---

## Phase 1: Global Resource Configuration
- [ ] **Step 1: Set Global Average Daily FTE Hours**
  - Navigate to **Project Administration > Settings > Properties – Resource** (or open the `sys_properties.list` and search for the `com.snc.resource_management.average_daily_fte` property).
  - Verify or configure the property to your organization's standard workday length (typically **`8`** hours). This serves as the system default.

---

## Phase 2: Resource Schedule Assignment (User Transform Map)
You can implement this via one of the following validated approaches:

### Option A: No-Code "Default Value" Field Map (Recommended)
- [ ] **Step 1: Configure Standard Schedule Mapping**
  - Open your existing User (`sys_user`) Transform Map.
  - In the **Field Maps** related list, click **New** and configure:
    * **Source field**: Select **`[None]`** (or `(none)` / `(none - use default value)`).
    * **Target field**: Select **`schedule`** (Reference field pointing to `cmn_schedule`).
    * **Referenced value field**: Select **`name`** (resolves schedule by name).
    * **Use default value**: Check this box.
    * **Default value**: Enter the exact name of your standard working schedule (e.g., **`8-5 weekdays`**).
    * **Choice action**: Set to **`reject`** (prevents silent failures if the calendar name is misspelled).

### Option B: Scripted `onAfter` Transform Script (Group-based Assignment Alternative)
- [ ] **Step 1: Implement Transform Script**
  - If you only want to assign schedules specifically when users are added to a Resource Group, add the `onAfter` transform script to your Group Member (`sys_user_grmember`) Transform Map.
  - Verify the script correctly checks for `PPS Resource` group type and queries `cmn_schedule` by name.

---

## Phase 3: Average Daily FTE / Workday Overrides
Configure these overrides if groups/users have different workday hours than the global standard:

- [ ] **Step 1: Map Group-Level Overrides**
  - In your Group (`sys_user_group`) Transform Map, map your CSV's workday duration column directly to **`average_daily_fte`** (Decimal).
  - Set **Choice action**: `create` (platform default).
- [ ] **Step 2: Map User-Level Overrides (Optional)**
  - In your User (`sys_user`) Transform Map, map your CSV's workday duration column directly to **`average_daily_fte`** (Decimal).
  - Set **Choice action**: `create` (platform default).

---

## Phase 4: Verification
- [ ] **Step 1: Verify Group Overrides**
  - Open an imported Resource Group record and confirm the **Average daily FTE hours** matches the CSV workday override.
- [ ] **Step 2: Verify User Work Schedules**
  - Open a newly imported Resource User record and verify that the **Schedule** reference field is correctly set to your standard working calendar.
