# Employee End Date Import — Setup Guide (One-Time)

This document covers the **one-time setup** for manually importing Employee End Dates into the Employee Profile table in ServiceNow. Once configured, you will use this process on an ad-hoc basis whenever end dates need to be bulk updated.

---

## Configuration Reference

| Item | Value |
|---|---|
| **Source Data** | CSV with two columns: SAM Account Name, Employee End Date |
| **Target Table** | `sn_employee_profile` |
| **Lookup Method** | Dot-walk to `u_samaccountname` on the `sys_user` reference |
| **Execution** | Manual / Ad-hoc |

---

## Step 1: Create the Staging Table & Data Source

Since this process runs manually, we will create a Data Source that you can easily attach a CSV to whenever needed.

### 1.1 — Create the Data Source
1. Navigate to **System Import Sets → Administration → Data Sources**.
2. Click **New**.
3. Fill in:
   - **Name:** `Manual Employee End Date Import`
   - **Import set table label:** `Employee End Date Import`
   - **Import set table name:** `u_employee_end_date_import` (This will auto-populate and create a new staging table).
   - **Format:** `CSV`
   - **Type:** `File`
   - **File retrieval method:** `Attachment`
4. Click **Save** (do not attach a file yet).

### 1.2 — Define Staging Table Columns
ServiceNow can auto-generate these when you load a file, but defining them manually ensures consistency.
1. Scroll down to the **Columns** related list on your new Data Source.
2. Click **New** and add the following two columns:
   - **Column label:** `SAM Account Name` | **Type:** `String` | **Max length:** `100`
   - **Column label:** `End Date` | **Type:** `String` (Leave as string for the staging table to handle various CSV date formats gracefully).

## Step 2: Create the Transform Map

This map handles linking the CSV data to the correct profile using Dot-Walking.

### 2.1 — Create the Map
1. Navigate to **System Import Sets → Transform Maps**.
2. Click **New**.
3. Fill in:
   - **Name:** `Employee End Date Transform`
   - **Source table:** `Employee End Date Import [u_employee_end_date_import]`
   - **Target table:** `Employee Profile [sn_employee_profile]`
   - **Run business rules:** Checked
   - **Active:** Checked
4. **Save**.

### 2.2 — Add Field Mapping: User Lookup (Dot-Walking)
Click **New** in the **Field Maps** related list:

| Setting | Value |
|---|---|
| **Source field** | `u_sam_account_name` |
| **Target field** | `user` (or the reference field to sys_user on the profile) |
| **Coalesce** | **Yes** |
| **Reference value field name** | `u_samaccountname` |
| **Choice action** | `reject` (Prevents creating new profiles for invalid users) |

*Note: By setting the Reference value field name, ServiceNow will look up the user by their SAM Account Name instead of their Sys ID.*
**Save** the field map.

### 2.3 — Add Field Mapping: End Date
Click **New** in the **Field Maps** related list:

| Setting | Value |
|---|---|
| **Source field** | `u_end_date` |
| **Target field** | `employment_end_date` |
| **Coalesce** | No |
| **Date format** | Select or enter the exact format used in your CSV (e.g., `yyyy-MM-dd` or `MM/dd/yyyy`) |

**Save** the field map.

---

## Setup Complete

The architecture is now fully built. To actually run the import, refer to the **Employee End Date Import — Operations Guide**.
