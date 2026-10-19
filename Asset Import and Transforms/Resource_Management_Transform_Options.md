# Resource Management Transform Guide

This guide describes how to programmatically manage **Work Schedules** and **Average Daily FTE Hours** (Hours Per Person Day) when importing Resource Groups and members into ServiceNow.

---

## 1. Understanding the Resource Management Data Model

In ServiceNow, Resource Management is built on core platform tables:
* **Resource Group**: A standard group record in the **`sys_user_group`** table. To act as a Resource Group, it typically has the **`resource_user`** role associated with it, or its `type` field contains the "resource" type.
* **Resource**: A standard user record in the **`sys_user`** table who belongs to a Resource Group.
* **Work Schedule**: Defined in the **`cmn_schedule`** table (e.g., "8-5 weekdays"). The schedule determines the resource's **actual capacity** (working hours). The schedule is referenced in the `schedule` field on `sys_user`.
* **FTE Conversion Factor**: The **`average_daily_fte`** field on `sys_user_group` and `sys_user` (or the global property `com.snc.resource_management.average_daily_fte`) is used as a conversion multiplier to translate "FTE" or "Person Days" into planned hours (e.g., 1 FTE = 8 hours/day).

---

## 2. Resource Schedule Assignment

To assign your standard work schedule to your imported users during the transform, you can choose between a **No-Code Configuration** (recommended) or a **Scripted Assignment**.

### Option A: No-Code "Default Value" Field Map (Recommended)
This is the standard out-of-the-box best practice in ServiceNow. It allows you to assign your standard working schedule to all imported resources without needing a schedule column in your source CSV.

#### How to configure it:
1. Open your **User (`sys_user`)** Transform Map.
2. In the **Field Maps** related list, click **New**.
3. Configure the Field Map as follows:
   * **Source field**: Select **`[None]`** (or `(none - use default value)` in the dropdown).
   * **Target field**: Select **`schedule`** (Reference field pointing to `cmn_schedule`).
   * **Referenced value field**: Select **`name`** (tells the system to search by name).
   * Check the **`Use default value`** checkbox.
   * **Default value**: Enter the **exact name** of your standard schedule record as it appears in ServiceNow (e.g., `8-5 weekdays` or `Standard Working Calendar`).
   * **Choice action**: Set to **`reject`** (Acts as a safety warning; if you type the name wrong, it rejects the transform rather than creating a blank relationship).

Every user record processed by the import will automatically have your standard working schedule assigned.

---

### Option B: Scripted `onAfter` Transform Script (Group-based Assignment)
If you only want to assign the standard schedule to a user **specifically when they are added to a Resource Group** (rather than applying it to every user in the CSV), you can use an `onAfter` script in your **Group Member (`sys_user_grmember`)** Transform Map.

Add this script to your Group Member map:

```javascript
(function runTransformScript(source, map, log, target /*undefined onStart*/ ) {

    // 1. Get the group record and verify it is a Resource Group
    var groupGr = new GlideRecord("sys_user_group");
    if (groupGr.get(target.group)) {
        
        var isResourceGroup = groupGr.type.toString().indexOf("resource") > -1 || 
                             groupGr.name.toString().indexOf("Resource") > -1;

        if (isResourceGroup) {
            
            // 2. Locate your standard company working schedule
            var scheduleName = "8-5 weekdays"; // REPLACE with the exact name of your cmn_schedule record
            var scheduleGr = new GlideRecord("cmn_schedule");
            if (scheduleGr.get("name", scheduleName)) {
                
                // 3. Find the user record and update their schedule reference
                var userGr = new GlideRecord("sys_user");
                if (userGr.get(target.user)) {
                    
                    // Only update if the user does not already have a schedule assigned
                    if (JSUtil.nil(userGr.schedule)) {
                        userGr.schedule = scheduleGr.getUniqueValue();
                        userGr.update();
                        
                        log.info("Programmatically assigned schedule '" + scheduleName + 
                                 "' to resource user: " + userGr.user_name);
                    }
                }
            } else {
                log.warn("Resource schedule '" + scheduleName + "' was not found.");
            }
        }
    }

})(source, map, log, target);
```

---

## 3. Managing Average Daily FTE Hours / Hours Per Person Day

Servicenow uses these values to calculate planning hours. You can manage this at two levels:

### Level A: The Global Property (System-Wide Default)
If a resource or group does not have a specific FTE hours value defined on their record, ServiceNow uses the global system property.
* **Property Name**: `com.snc.resource_management.average_daily_fte`
* **Default Value**: `8` (8 hours = 1.0 FTE or 1.0 Person-Day).
* **Setting it**: Navigate to **Project Administration > Settings > Properties – Resource** (or type `sys_properties.list` in the navigator and filter for this property name) to set this globally.

### Level B: Programmatic Group / User Overrides
If your resource groups have different workday lengths (e.g., standard teams work 8 hours, but shift teams or external contractors work 10 hours), you can override this directly on the Group (`sys_user_group`) or User (`sys_user`) records using the standard **`average_daily_fte`** column.

#### Method 1: Direct Field Mapping (Transform Map)
In your **Group (`sys_user_group`)** or **User (`sys_user`)** Transform Map, you can map your CSV's "Average daily FTE hours" column directly to the standard column:
* **Source field**: `[your CSV column, e.g. FTE Hours]`
* **Target field**: `average_daily_fte` (Decimal field)
* **Choice action**: `create`

#### Method 2: Scripted Defaulting (Transform Script)
If you want to enforce a default average daily FTE hours value (e.g., `8` hours) for all imported Resource Groups dynamically during the group import:

Add this **`onBefore`** script to your **Group (`sys_user_group`)** Transform Map:

```javascript
(function runTransformScript(source, map, log, target /*undefined onStart*/ ) {

    // Ensure the group is flagged as a Resource Group by setting its type
    // In ServiceNow, the 'type' field is a Glide List. We append 'resource' to it.
    var resourceTypeSysId = "db800657c0a8016501d5c52c6f10c571"; // REPLACE with the sys_id of your 'resource' group type
    
    var currentTypes = target.type.toString();
    if (currentTypes.indexOf(resourceTypeSysId) === -1) {
        target.type = currentTypes ? currentTypes + "," + resourceTypeSysId : resourceTypeSysId;
    }

    // Set the average daily FTE hours to 8 if it is empty/blank in the source CSV
    if (JSUtil.nil(source.u_average_daily_fte)) {
        target.average_daily_fte = 8.0; // Sets default conversion: 1 FTE = 8 hours
    }

})(source, map, log, target);
```
