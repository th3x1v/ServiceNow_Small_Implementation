# Employee End Date Import — Operations Guide

This document outlines the standard operating procedure for manually importing and updating Employee End Dates using the pre-configured Data Source and Transform Map.

*Note: Ensure the one-time setup has been completed per the Setup Guide before following these steps.*

---

## Prerequisites

1. You need a CSV file containing exactly two columns:
   - **SAM Account Name** (The exact AD username, e.g., `jsmith`)
   - **End Date** (Ensure the date format in the CSV matches the format configured in your Transform Map, e.g., `yyyy-MM-dd`)
2. You must have the `import_admin` role (or equivalent) in ServiceNow.

---

## Step 1: Upload the CSV Data

Since this is an ad-hoc manual import, you will attach the file directly to the Data Source.

1. Navigate to **System Import Sets → Administration → Data Sources**.
2. Search for and open the Data Source named `Manual Employee End Date Import`.
3. At the top of the form, click the **Paperclip (Manage Attachments)** icon.
4. If there are any old CSV files attached to this record, **delete them** to prevent ServiceNow from loading old data.
5. Upload your new CSV file.
6. Close the attachment dialog.

## Step 2: Load the Data into the Staging Table

1. On the Data Source record, scroll down to the **Related Links** section.
2. Click **Load All Records**.
3. ServiceNow will parse your CSV and load it into the staging table.
4. When finished, you will see a progress screen. Verify that the **State** is Complete and that the **Processed** record count matches the number of rows in your CSV.

## Step 3: Run the Transform

1. From the progress screen in the previous step, click the **Run Transform** link.
   *(Alternatively, navigate to **System Import Sets → Import Sets**, open the newly created Import Set, and click **Transform**).*
2. In the "Specify Transform maps" slushbucket, ensure `Employee End Date Transform` is selected and in the right-hand bucket.
3. Click **Transform**.

## Step 4: Verify the Results

1. Review the Transform history on the screen.
2. The **Inserts** column should be 0 (since we are only updating existing profiles).
3. The **Updates** column should match the number of valid users in your CSV.
4. The **Errors / Ignored** columns should be reviewed if they are greater than 0:
   - *If records were Ignored:* It likely means the SAM Account Name in the CSV did not match any active user in the `sys_user` table (due to the `reject` choice action on the coalesce field).
5. **Spot Check:** Navigate to `sn_employee_profile.list`, search for 2-3 users from your CSV, and verify their End Date field is populated correctly.
