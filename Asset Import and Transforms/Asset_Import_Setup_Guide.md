ASSET IMPORT - SETUP GUIDE (ONE-TIME)

This document covers the one-time setup for the ServiceNow Asset Import process. It describes how to build two automated transform pipelines that will self-generate your reference data (Vendors, Manufacturers, Model Categories, Models, Cost Centers), and how to safely purge the existing bad asset data in a sub-prod instance before executing the final imports.

> [!CAUTION]
> Testing this procedure in a sub-prod (DEV) instance is strictly required. Deleting assets can cascade and delete connected Configuration Items (CIs). We must ensure the cmdb_ci records remain untouched during the purge.


WHAT YOU'RE BUILDING

You are building two distinct, manually-triggered pipelines using chained Transform Maps:

    1. Pipeline 1: Purchase/Contract Import
       Automatically builds Cost Centers and Vendors from your historical purchase CSV, then imports the contracts into ast_contract.

    2. A Clean Slate
       A procedure to safely mass-delete all poorly mapped records from alm_hardware while preserving the CIs originally created by MECM/SCCM.

    3. Pipeline 2: Asset Hardware Import
       Automatically builds Model Categories, Manufacturers, and Models from your hardware CSV, then imports the assets into alm_hardware (linking them to the contracts, models, and other reference data).

> [!NOTE]
> There are no scheduled jobs or Flow Designer triggers in this setup. You are the trigger. The pipelines execute only when you click Run Transform.


STEP 1: PIPELINE 1 - PURCHASE/CONTRACT SETUP

This pipeline processes your ~12,000 historical purchase records. It uses 5 chained transform maps to ensure all reference data exists before the contract is created, and attaches the purchased items as related Rate Card line items.


1. Create the Staging Table

    a. Navigate to System Import Sets > Load Data.
    b. Import set table: Select "Create table".
    c. Label: Purchase Contract Import (this creates u_purchase_contract_import).
    d. Upload your purchase CSV and click Submit.


2. Map 100: Create Cost Centers

    a. Navigate to System Import Sets > Transform Maps and click New.
        - Name:         Purchase 1 - Create Cost Centers
        - Source table:  u_purchase_contract_import
        - Target table:  cmn_cost_center
        - Run order:     100

    b. Save the record.

    c. Create a Field Map:
        - Source field:  [your CSV's Cost Center column]
        - Target field:  name
        - Coalesce:      Yes
        - Choice action: reject


3. Map 200: Create Vendors

    a. Create a new Transform Map.
        - Name:         Purchase 2 - Create Vendors
        - Source table:  u_purchase_contract_import
        - Target table:  core_company
        - Run order:     200

    b. Save the record.

    c. Create Field Map #1:
        - Source field:  [your CSV's Vendor column]
        - Target field:  name
        - Coalesce:      Yes

    d. Create Field Map #2:
        - Source field:  (none - use default value)
        - Target field:  vendor
        - Default value: true

    > [!NOTE]
    > If a company in your data is both a Vendor and a Manufacturer (for example, Dell sells you laptops and also manufactures them), the Manufacturer flag will be set separately by Pipeline 2. After both pipelines have run, verify that companies appearing in both roles have both the "Vendor" and "Manufacturer" checkboxes enabled on their core_company record.


4. Map 250: Create Vendor Catalogs

    a. Create a new Transform Map.
        - Name:         Purchase 3 - Create Vendor Catalogs
        - Source table:  u_purchase_contract_import
        - Target table:  pc_vendor_cat_item
        - Run order:     250

    b. Save the record.

    c. Create Field Map #1 (Vendor Reference):
        - Source field:  [your CSV's Vendor column]
        - Target field:  vendor
        - Reference value: name

    d. Create Field Map #2 (Catalog Name):
        - Source field:  [your CSV's Catalog or Product column]
        - Target field:  name
        - Coalesce:      Yes

    e. (Optional) Create Field Map #3 (Product Catalog Item Reference):
        - Source field:  [your CSV's Product Model column]
        - Target field:  product_catalog_item
        - Reference value: name

    > [!NOTE]
    > The pc_vendor_cat_item table links a Vendor to the specific products they supply.


5. Map 400: Import Contracts (PO Headers)

    a. Create a new Transform Map.
        - Name:         Purchase 4 - Import Contracts
        - Source table:  u_purchase_contract_import
        - Target table:  ast_contract
        - Run order:     400

    b. Save the record.

    c. Map your header-level fields (PO Number, Date, Total Cost, etc.). Do NOT map individual line item descriptions here.

    d. Set Coalesce to true on the field that uniquely identifies the contract (e.g., PO Number). This ensures only one header record is created per PO, even if the CSV has multiple rows for it.

    e. Map your Vendor column to the vendor field.
        - Reference value: name

    f. Map your Cost Center column to the cost_center field.
        - Reference value: name


6. Map 500: (Skipped in Base ITSM)

    Since your base ITSM Pro instance does not have the Cost Management/ITAM plugins enabled, individual Rate Cards (clm_rate_card) are not available. 
    
    - You will skip this map entirely.
    - Instead, your individual item details and costs will be imported directly onto the hardware assets in Pipeline 2, which aligns with standard ServiceNow ITSM architecture.


STEP 2: SAFELY PURGING EXISTING ASSETS IN DEV

Before running Pipeline 2 to import the new assets, you must wipe out all existing bad asset data.


1. Check CI Dictionary Cascade Delete Rules

    By default, deleting an asset might trigger a database-level cascade delete that deletes the corresponding Configuration Item (CI). Since you are running basic ITSM, the "Asset Management Properties" UI is not available, so you must verify this directly in the System Dictionary.

    a. Navigate to System Definition > Dictionary.
    b. Filter the list for:
       - Table: cmdb_ci
       - Column Name: asset
    c. Open the dictionary record for `cmdb_ci.asset`.
    d. Check the Reference cascade rule field (usually under the Reference Specification tab):
       - If it is set to -- None --, you are safe! Deleting the asset will not affect the CI.
       - If it is set to Delete, you MUST temporarily change this to -- None -- or Clear reference before performing your purge. Be sure to restore it to its original value after the import is complete.


2. Execute Asset Deletion

    In your DEV instance, test deleting a small set of the bad assets first to ensure the CIs are safe.

    a. Navigate to your target table (e.g., `alm_hardware.list`).
    b. Filter for a handful of the corrupted/bad assets.
    c. Select them and choose Delete from the list actions.
    d. Go to `cmdb_ci_computer.list` and verify the corresponding CIs still exist.

    Once you are ready to perform the mass deletion, use a Background Script with `setWorkflow(false)` to prevent triggering business rules. 

    To do this safely, follow these step-by-step phases:

    PHASE A: THE DRY RUN (SAFETY COUNT CHECK)
    
    Before deleting anything, you must verify that your query targets the exact number of records you expect.
    
    1. In the ServiceNow filter navigator, type `sys.scripts.do` and press Enter (or navigate to **System Definition > Scripts - Background**).
    2. Ensure the **In scope** dropdown is set to **global**.
    3. Copy and paste the following script into the text field:
    
       ---- Dry Run Script ----
       var gr = new GlideRecord("alm_hardware");
       // CUSTOMIZE THIS QUERY or remove it to target all records
       gr.addEncodedQuery("sys_created_on<javascript:gs.dateGenerate('2026-01-01','00:00:00')");
       gr.query();
       gs.print("TOTAL ASSETS TARGETED FOR DELETION: " + gr.getRowCount());
       ------------------------
       
    4. Click the **Run script** button.
    5. Check the log output page. It will output a line saying:
       `*** Script: TOTAL ASSETS TARGETED FOR DELETION: <count>`
       Verify that this number matches your expectations before moving to Phase B.

    PHASE B: THE HIGH-PERFORMANCE MASS PURGE (SINGLE EXECUTION)

    Once you have verified the row count in Phase A, you can execute the actual deletion. 
    
    To avoid transaction timeouts ("failed to fetch") and avoid having to manually run batches, we will use ServiceNow's native **`deleteMultiple()`** method combined with **`setWorkflow(false)`**. This executes the entire purge as a single, direct database query instead of looping record-by-record in Javascript. For 12,000+ records, this will complete **almost instantly** (typically under 2 seconds) and completely avoids any timeouts!

    1. Return to the **Scripts - Background** page.
    2. Copy and paste the following script into the text field:
    
       ---- Purge Script ----
       var gr = new GlideRecord("alm_hardware");
       // MUST MATCH THE QUERY USED IN PHASE A
       gr.addEncodedQuery("sys_created_on<javascript:gs.dateGenerate('2026-01-01','00:00:00')");
       gr.query();
       var count = gr.getRowCount();
       
       gr.setWorkflow(false);       // Prevents cascading business rules and workflows
       gr.deleteMultiple();         // Performs high-performance bulk database delete
       
       gs.print("Mass deletion complete. Total records deleted: " + count);
       ----------------------
       
    3. Click the **Run script** button.
    4. The script will execute almost instantly. The output page will display "Mass deletion complete. Total records deleted: <count>" within seconds.
    5. Run your Phase A "Dry Run" script once more to confirm the remaining count is now **0**.


STEP 3: PIPELINE 2 - ASSET HARDWARE SETUP

This pipeline processes your tens of thousands of hardware assets. It uses 4 chained transform maps to ensure Model Categories, Manufacturers, and Models exist before the asset is created.


1. Create the Staging Table

    a. Navigate to System Import Sets > Load Data.
    b. Import set table: Select "Create table".
    c. Label: Asset Manual Import (this creates u_asset_manual_import).
    d. Upload your asset CSV and click Submit.


2. Map 050: Create Model Categories

    a. Navigate to System Import Sets > Transform Maps and click New.
        - Name:         Asset 0 - Create Model Categories
        - Source table:  u_asset_manual_import
        - Target table:  cmdb_model_category
        - Run order:     50

    b. Save the record.

    c. Create the following three Field Maps:

        **Field Map #1 (Category Name):**
        - Source field:  Model Category
        - Target field:  name
        - Coalesce:      Yes
        - Choice action: create   (ServiceNow default value)

        **Field Map #2 (Asset Class):**
        - Source field:  [None]
        - Target field:  asset_class
        - Choice action: reject
        - Use source script: checked
        - Source Script (sets standard Hardware Asset table):
          ```javascript
          answer = (function transformEntry(source) {
              return "alm_hardware";
          })(source);
          ```

        **Field Map #3 (CI Class):**
        - Source field:  [None]
        - Target field:  ci_class
        - Choice action: reject
        - Use source script: checked
        - Source Script (sets standard Computer CI table):
          ```javascript
          answer = (function transformEntry(source) {
              return "cmdb_ci_computer";
          })(source);
          ```

    > [!NOTE]
    > Model Categories classify what type of hardware a Model represents.
    > Without these script mappings, if the pipeline encounters a new category (like "Laptop" or "Desktop"), ServiceNow will create it with empty Asset and CI classes, which breaks the CMDB sync. These scripts ensure all dynamically created categories are fully configured out-of-the-box.


3. Map 100: Create Manufacturers

    a. Create a new Transform Map.
        - Name:         Asset 1 - Create Manufacturers
        - Source table:  u_asset_manual_import
        - Target table:  core_company
        - Run order:     100

    b. Save the record.

    c. Create Field Map #1:
        - Source field:  Manufacturer
        - Target field:  name
        - Coalesce:      Yes
        - Choice action: create   (ServiceNow default value)

    d. Create Field Map #2:
        - Source field:  (none - use default value)
        - Target field:  manufacturer
        - Default value: true
        - Choice action: create   (ServiceNow default value)


4. Map 200: Create Models

    a. Create a new Transform Map.
        - Name:         Asset 2 - Create Models
        - Source table:  u_asset_manual_import
        - Target table:  cmdb_hardware_product_model
        - Run order:     200

    b. Save the record.

    c. Create Field Map #1 (Model Name):
        - Source field:  Model
        - Target field:  name
        - Coalesce:      Yes
        - Choice action: create   (ServiceNow default value)

    d. Create Field Map #2 (Manufacturer Reference):
        - Source field:  Manufacturer
        - Target field:  manufacturer
        - Reference value: name
        - Choice action: reject   (Rejects row if manufacturer is missing - ensures data health)

    e. Create Field Map #3 (Model Category Reference):
        - Source field:  Model Category
        - Target field:  model_categories
        - Reference value: name
        - Choice action: reject   (Rejects row if category is missing)

    f. Create Field Map #4 (Part Number / Model Number):
        - Source field:  Part Number
        - Target field:  model_number
        - Choice action: create   (ServiceNow default value)


5. Map 300: Import Assets

    a. Create a new Transform Map.
        - Name:         Asset 3 - Import Assets
        - Source table:  u_asset_manual_import
        - Target table:  alm_hardware
        - Run order:     300

    b. Save the record.

    c. CRITICAL STEP: Map your Serial Number column to serial_number.
        - Target field:  serial_number
        - Coalesce:      Yes
        - Choice action: create
        - Use source script: checked
        - Source Script (Trims whitespace to prevent duplicate errors due to spaces in the CSV):
          ```javascript
          answer = (function transformEntry(source) {
              var serial = source.getValue('u_serial_number'); // Replace with exact staging column name
              return JSUtil.nil(serial) ? "" : serial.toString().trim();
          })(source);
          ```
        
        > [!IMPORTANT]
        > **Coalesce Constraints:**
        > 1. Ensure `serial_number` is the **only** coalesce field on this entire transform map. If other fields (like asset_tag) are set to coalesce, ServiceNow will use `AND` logic, causing match lookups to fail and attempt duplicate inserts.
        > 2. The source script above is critical: leading or trailing spaces in the CSV (e.g. `" ABC1234 "`) will prevent coalesce from matching existing records, causing the system to attempt an insert and trigger a duplicate serial number database error.

    d. CRITICAL STEP: Map your Model and Category to ensure CI generation!
        - Source field:  Model Category
        - Target field:  model_category
        - Reference value: name
        - Choice action: reject   (Rejects if category is missing - Map 050 handles safe creation of categories)
        
        - Source field:  Model
        - Target field:  model
        - Reference value: name
        - Choice action: reject   (Rejects if model is missing)

    e. Map your remaining legacy asset fields to alm_hardware:

        -- STANDARD OUT-OF-THE-BOX FIELDS (ITSM Base) --
        - Asset Tage                     ->  asset_tag (OOTB String)
          * Choice action: create
        - Cost                           ->  cost (OOTB Currency)
          * Choice action: create
        - Date Assigned                  ->  assigned (OOTB Date/Time - via Source Script)
          * Choice action: create
          * Source Script (Check the "Use source script" checkbox on the Field Map):
            ```javascript
            // Parses "M/d/yyyy" date strings and converts to standard database format
            answer = (function transformEntry(source) {
                var rawDate = source.getValue('u_date_assigned'); // Replace with exact column name
                if (JSUtil.nil(rawDate)) {
                    return "";
                }
                var gdt = new GlideDateTime();
                gdt.setDisplayValue(rawDate.toString().trim() + " 00:00:00", "M/d/yyyy HH:mm:ss");
                if (gdt.isValid()) return gdt.getValue();
                return "";
            })(source);
            ```
        - [None]                         ->  install_status (OOTB Choice - Force 'In Use')
          * Choice action: ignore
          * Default value: 1
        - IMEI Number                    ->  comments (OOTB Journal Input)
          * Choice action: create
          * Use source script: checked
          * Source Script (Appends IMEI to comments):
            ```javascript
            answer = (function transformEntry(source) {
                var imei = source.getValue('u_imei_number'); // Replace with exact column name
                if (!JSUtil.nil(imei) && imei.toString().trim() !== "") {
                    return "IMEI: " + imei.toString().trim();
                }
                return "";
            })(source);
            ```
        - Location                       ->  location (OOTB Reference - value: name)
          * Choice action: reject   (Ensures typos won't bypass location validation)
        - Cost Code                      ->  cost_center (OOTB Reference - value: name)
          * Choice action: reject   (Rejects if cost center was not created in Pipeline 1)
        - Assigned To                    ->  assigned_to (OOTB Reference - via Source Script)
          * Choice action: ignore   (Leaves blank if primary user record is missing)
          * Referenced value field: sys_id 
          * Source Script (Check the "Use source script" checkbox on the Field Map):
            ```javascript
            answer = (function transformEntry(source) {
                var sourceVal = source.getValue('u_assigned_to'); 
                if (JSUtil.nil(sourceVal) || !sourceVal.toString().trim()) return "";
                var namePart = sourceVal.toString().split('(')[0].trim();
                var parts = namePart.split(',');
                var searchName = (parts.length === 2) ? parts[1].trim() + " " + parts[0].trim() : namePart;
                
                var userGR = new GlideRecord("sys_user");
                userGR.addQuery("name", searchName);
                userGR.addActiveQuery();
                userGR.query();
                if (userGR.next()) return userGR.getUniqueValue();
                return "";
            })(source);
            ```
        - PO Number                      ->  po_number (OOTB String)
          * Choice action: create
        - Lease Contract                 ->  lease_id (OOTB String - can hold Contract numbers)
          * Choice action: create
        - Warranty Expiration            ->  warranty_expiration (OOTB Date)
          * Choice action: create
          * Use source script: checked
          * Source Script:
            ```javascript
            answer = (function transformEntry(source) {
                var rawDate = source.getValue('u_warranty_expiration'); // Replace with exact column name
                if (JSUtil.nil(rawDate)) return "";
                var gdt = new GlideDateTime();
                gdt.setDisplayValue(rawDate.toString().trim() + " 00:00:00", "M/d/yyyy HH:mm:ss");
                if (gdt.isValid()) return gdt.getValue();
                return "";
            })(source);
            ```

        -- FIELDS REQUIRING CUSTOM COLUMNS OR ALTERNATIVES --
        - Phone Number                   ->  u_phone_number (Custom String field)
          * Choice action: create

        > [!NOTE]
        > In base ITSM Pro, fields like 'delivery_date' (Order Received) and 'last_audit_date' are only created when the Procurement and HAM plugins are activated. Creating simple custom fields (prefixed with u_) is the recommended best practice to capture this historical legacy data.

        > [!NOTE]
        > **REJECT vs IGNORE vs CREATE CHOICES:**
        > - Set Choice action to REJECT on fields that must exist (e.g. Models, Cost Centers, Vendors, Locations). This ensures a typo in your CSV won't create a junk record or bypass important checks.
        > - Set Choice action to IGNORE on fields that are optional (e.g. Users, Departments). If the user or department doesn't exist, ServiceNow will leave the field blank but still import the asset record successfully.
        > - Set Choice action to CREATE on fields that are standard, non-reference fields (e.g. Strings, Dates, Booleans, Currencies). While choice action has no functional effect on these data types, setting it to 'create' matches standard platform defaults.

    > [!NOTE]
    > Do NOT map the CI column manually. Since the MECM/SCCM Service Graph
    > Connector has already been created and the asset-to-CI relationship is automatically 
    > resolved by it, you will deliberately leave both 'associated configuration item' 
    > and 'hardware asset has catalog item' (which both contain the computer name in your source data) 
    > UNMAPPED. We will rely on MECM discovery runs to naturally hook up the newly 
    > imported Assets to their respective CIs automatically via Serial Number.


6. Map 400: Link Assets to Contracts (Assets Covered)

    To associate your newly created Assets with their parent Contracts/POs, you will use ServiceNow's standard Many-to-Many table.

    a. Create a new Transform Map.
        - Name:         Asset 4 - Link Assets to Contracts
        - Source table:  u_asset_manual_import
        - Target table:  clm_m2m_contract_asset
        - Run order:     400

    b. Save the record.

    c. Create Field Map #1 (Asset Reference):
        - Source field:  serial number
        - Target field:  asset
        - Reference value: serial_number
        - Coalesce:      Yes
        - Choice action: reject   (Rejects row if the Asset serial number doesn't exist in alm_hardware)

    d. Create Field Map #2 (Contract Reference):
        - Source field:  hardware asset has purchase order
        - Target field:  contract
        - Reference value: vendor_contract
        - Coalesce:      Yes
        - Choice action: reject   (Rejects row if the Contract/PO doesn't exist in ast_contract)

    > [!NOTE]
    > Setting Coalesce to Yes on both fields creates a composite key, ensuring that if you run the import again, it will not create duplicate relationship records.

STEP 4: RUN INITIAL DEV TEST

You will manually trigger both pipelines in sequence.

    1. Run Pipeline 1:
       Go to your Purchase Contract Import import set and click Run Transform.
       Select all four active Purchase maps (skipping the Map 500 placeholder) and execute.
       Verify ast_contract records were created with correct Vendor and Cost Center references.

    2. Run Pipeline 2:
       Go to your Asset Manual Import import set and click Run Transform.
       Select all five Asset maps and execute.
       Verify alm_hardware records were created and linked correctly.
       Open a Contract record and check the "Assets Covered" related list to verify that the imported hardware assets were automatically linked to their respective contracts.

    3. Verify the full reference chain for 3-5 sample records:
        - Asset references the correct Model
        - Model references the correct Manufacturer and Model Category
        - Asset is linked to the correct Contract/PO (verify under the "Assets Covered" related list on the Contract record)
        - Contract references the correct Vendor
        - Asset references the correct Cost Center, Location, and Department

Once you have perfected the transform maps and verified the data structure in the DEV instance, you are ready to port the Transform Maps via an Update Set to Production and execute the process there.

For ongoing "as-needed" asset batches going forward, refer to the Operations Guide.
