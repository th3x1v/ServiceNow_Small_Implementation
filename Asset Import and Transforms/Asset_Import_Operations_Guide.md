# Asset Import - Operations Guide

This guide covers the ongoing "as-needed" manual process for importing batches of new hardware into ServiceNow. 

> [!NOTE]
> We maintain assets by uploading CSV files manually as new groups of hardware are received. Because we use **chained Transform Maps**, if a CSV contains a brand new Manufacturer or Model that doesn't exist in the system yet, the pipeline will automatically create them for you on the fly.

---

## 1. Prepare the CSV File

When a batch of new hardware arrives, collect their data in your standard CSV format template.

**Critical Requirements:**
- **Serial Number** must be populated for every row. This is the coalesce field used to uniquely identify assets and avoid duplicates.
- Ensure any reference fields (PO Number, Cost Center, Location, Department) match the spelling of existing records in the system.

---

## 2. Upload the Hardware Batch

When you are ready to import the batch:

1. Navigate to **System Import Sets > Load Data**.
2. For **Import set table**, choose `Existing table`.
3. Select the staging table set up during the one-time configuration (`u_asset_manual_import`).
4. **Source of import**: File
5. Upload your prepared CSV.
6. Click **Submit**.

---

## 3. Run the Transform Pipeline

You must run all three maps in the sequence to ensure reference data builds correctly before the asset is created.

1. Once the upload completes, click **Run Transform** on the confirmation screen (or navigate to **System Import Sets > Run Transform**).
2. Select all three maps you created during setup:
   - `Asset 1 - Create Manufacturers`
   - `Asset 2 - Create Models`
   - `Asset 3 - Import Assets`
3. Click **Transform**.

---

## 4. Review the Results

Wait a few moments for the transform pipeline to execute. 

You should see a summary such as:
```
Inserts: [total rows in batch]
Updates: 0
Errors:  0
```

* **Inserts**: The newly injected hardware rows, as well as any brand new Models or Manufacturers that were auto-created.
* **Updates**: If a Serial Number already existed in the system, the import will simply update the mapped fields instead of generating duplicates.
* **Errors**: Check the **Import Set Rows -> Error state** if a row failed (commonly due to a blank Serial Number or a misspelled reference like Cost Center).

### Spot-Check Verification

Ensure the import worked flawlessly:
1. Go to **Asset > Portfolios > Hardware Assets** (or All Assets).
2. Search for 2-3 newly added Serial Numbers.
3. Confirm that the imported data points populated their respective fields correctly (especially the Model, PO Number, and Cost Center).
4. Over time, as devices are plugged into the network, confirm that the MECM/SCCM Service Graph Connector continues to successfully relate the new CIs automatically.

---

## 5. Handling Rejected Imports (Missing Model Categories)

Unlike Manufacturers and Models, **Model Categories** are explicitly configured to **reject** during the import if they do not exist. This is a safety mechanism to prevent broken CIs.

If your import errors out because it encountered a new hardware type (e.g., "TV" or "Projector"), you must manually create the Model Category before rerunning the import.

### Scenario A: Standard Hardware (Needs a CI)
If the new hardware is something that will connect to the network (e.g., a new type of Switch) and needs a CMDB record:
1. Navigate to **Product Catalog > Product Model > Model Categories**.
2. Click **New**.
3. Name: (e.g., "Switch")
4. CI Class: `cmdb_ci_netgear` (or the appropriate CMDB table).
5. Asset Class: `alm_hardware`.
6. Save and rerun the import.

### Scenario B: Financial Assets Only (No CI - e.g., TVs, Furniture)
If the new hardware is purely for financial/inventory tracking and you **do not** want it cluttering your CMDB:
1. Navigate to **Product Catalog > Product Model > Model Categories**.
2. Click **New**.
3. Name: (e.g., "TV" or "Desk")
4. **CI Class**: *-- Leave this completely blank! --*
5. Asset Class: `alm_hardware` (or `alm_facility`).
6. Save and rerun the import. 

By leaving the CI Class blank, ServiceNow knows to only create the financial Asset record for this hardware type, keeping your CMDB clean.

---

## 6. Troubleshooting "Already an Asset with that Serial Number" Errors

If your import set rows fail with an error stating **"there is already an asset with that serial number"**, it means the Transform Map is attempting to perform an **Insert** rather than an **Update** for a record that already exists. 

Follow these steps to diagnose and fix the issue:

### Step 1: Check for Class Mismatches (alm_asset.list)
The transform map targets `alm_hardware`. If the existing asset with that serial number was created in a different table (e.g. Consumable `alm_consumable`, Software License, or parent `alm_asset`), the coalesce lookup on the `alm_hardware` table will fail to find it.
1. In ServiceNow, navigate to the parent asset table: `alm_asset.list` (type this in the filter navigator and press Enter).
2. Search for the duplicate serial number.
3. Look at the **Class** column:
   * **If the Class is "Hardware":** Proceed to Step 2.
   * **If the Class is anything else (e.g. Consumable):** You cannot coalesce match it with `alm_hardware`. You must either delete the incorrect record (if created in error) or manage it under its correct table.

### Step 2: Verify the Transform Map Coalesce Configuration
1. Navigate to **System Import Sets > Transform Maps** and open `Asset 3 - Import Assets`.
2. Scroll to the **Field Maps** related list.
3. Ensure **only** the `serial_number` field has **Coalesce** set to **true**. If any other field is also set to coalesce (like `asset_tag`), the system will evaluate using `AND` logic, causing matches to fail if one field differs.
### Step 3: Check for Whitespace or Casing Differences
While the transform guide configures a source script to automatically trim whitespace, very unusual CSV formats (e.g., hidden characters) might still bypass matching. 
1. In your staging table (`u_asset_manual_import`), open the row that failed.
2. Inspect the raw value of the serial number and compare it to the record in `alm_hardware`. Check for any trailing carriage returns or spaces.

### Step 4: Resolve Unlinked Records (CIs Created Before Assets)
If you imported the assets *after* the devices were already live on the network (meaning Discovery created the CIs first), they may not have automatically linked. 
* **The Solution:** Use **Scenario B (Retroactive Asset-CI Linking)** in [Orphan_Asset_CI_Linking_Script.md](file:///e:/Scripting%20Files/ServiceNow/Asset%20Import%20and%20Transforms/Orphan_Asset_CI_Linking_Script.md) to retroactively bind all existing unlinked CIs to your new Asset records by serial number.
