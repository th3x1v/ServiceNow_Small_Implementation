# ServiceNow Asset & CI Alignment Scripts

This document contains administrative background scripts used to repair and align Asset-CI synchronization links in ServiceNow. 

---

## Scenario A: Duplicate Asset Clean-up (SCCM/Discovery Duplicates)

### Purpose
If the Asset-CI synchronization chain breaks (e.g., an Asset was imported without a Model Category, failing to create a Shell CI), Discovery sources like SCCM/MECM will fail to find the existing Asset. As a result, Discovery will create a new CI, which automatically triggers the creation of a duplicate Asset record.

This script forcefully links orphaned CIs (created by Discovery) to their original Procurement Assets based on the **Serial Number**, and safely deletes the accidental duplicate Asset record.

### When to Use
Run this script when you have generated duplicate Assets because Discovery imported CIs that failed to match your existing Procurement Assets.

### How to Run
1. Log in to ServiceNow as an Administrator.
2. Navigate to **System Definition > Scripts - Background**.
3. Copy and paste the script below.
4. *(Recommended)* If you want to test it first without deleting anything, comment out `dupAsset.deleteRecord();` (Line 36 of the script).
5. Click **Run Script**.

### The Script
```javascript
// Target the CIs that were created today by Discovery (which are currently attached to duplicate assets)
var ci = new GlideRecord('cmdb_ci_computer');
ci.addEncodedQuery('asset.sys_created_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()'); 
ci.query();

var linkCount = 0;
while (ci.next()) {
    var serial = ci.serial_number.toString();
    
    // Find the original procurement asset (created before today) that matches the serial number
    var originalAsset = new GlideRecord('alm_hardware');
    originalAsset.addQuery('serial_number', serial);
    originalAsset.addEncodedQuery('sys_created_on<javascript:gs.beginningOfToday()');
    originalAsset.setLimit(1);
    originalAsset.query();
    
    if (originalAsset.next()) {
        // 1. Save the sys_id of the accidental duplicate asset Discovery just made
        var duplicateAssetId = ci.asset.toString();
        
        // 2. Link the CI to the original procurement asset
        ci.asset = originalAsset.getUniqueValue();
        ci.setWorkflow(false); // Do not trigger Business Rules
        ci.update();
        
        // 3. Link the original procurement asset back to the CI
        originalAsset.ci = ci.getUniqueValue();
        originalAsset.setWorkflow(false); // Do not trigger Business Rules
        originalAsset.update();
        
        // 4. Delete the accidental duplicate asset
        if (duplicateAssetId) {
            var dupAsset = new GlideRecord('alm_hardware');
            if (dupAsset.get(duplicateAssetId)) {
                dupAsset.setWorkflow(false); // Prevent cascade delete rules
                dupAsset.deleteRecord();
            }
        }
        linkCount++;
    }
}
gs.print("Successfully linked " + linkCount + " CIs to their original Procurement Assets and cleaned up the duplicates!");
```

---

## Scenario B: Retroactive Asset-CI Linking (CIs Created Before Asset Import)

### Purpose
Ideally, Assets are imported before devices go live on the network, allowing the MECM/SCCM Service Graph Connector to naturally resolve and link them. 

However, if a group onboards computers without notice, Discovery will create CIs first. When you manually import the assets later, they will not be linked to the pre-existing CIs. This script retroactively binds the newly imported Assets to those pre-existing CIs based on matching **Serial Numbers**.

### When to Use
Run this script when CIs already exist in the CMDB and you have manually imported the Assets afterward, leaving both records unlinked.

### How to Run
1. Navigate to **System Definition > Scripts - Background**.
2. Copy and paste the script below.
3. Click **Run Script**.

### The Script
```javascript
// 1. Query only the assets that do not have a CI linked yet
var asset = new GlideRecord('alm_hardware');
asset.addNullQuery('ci');
asset.addNotNullQuery('serial_number');
asset.query();

var linkCount = 0;
var notFoundCount = 0;

while (asset.next()) {
    var serial = asset.serial_number.toString().trim();
    if (!serial) continue;
    
    // 2. Find the hardware CI in the CMDB that matches this serial number
    var ci = new GlideRecord('cmdb_ci_hardware');
    ci.addQuery('serial_number', serial);
    ci.setLimit(1);
    ci.query();
    
    if (ci.next()) {
        // 3. Link CI to Asset
        ci.asset = asset.getUniqueValue();
        ci.setWorkflow(false); // Bypasses business rules to prevent duplicate asset generation
        ci.update();
        
        // 4. Link Asset to CI
        asset.ci = ci.getUniqueValue();
        asset.setWorkflow(false);
        asset.update();
        
        linkCount++;
    } else {
        notFoundCount++;
    }
}

gs.print("Completed!");
gs.print("-> Successfully linked: " + linkCount + " Assets to CIs");
gs.print("-> Assets with no matching CI found: " + notFoundCount);
```
