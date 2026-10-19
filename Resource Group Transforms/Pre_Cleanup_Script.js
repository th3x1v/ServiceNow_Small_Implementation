/**
 * Resource Group Pre-Cleanup Script
 * 
 * Purpose: Manually clear out group memberships for capacity teams before running 
 * the Resource Group Import. 
 * 
 * Filters:
 * - Only targets groups that currently possess the 'pps_resource' role.
 * - IGNORES any group whose name contains a colon (':').
 * 
 * Usage: Run as a Fix Script or Background Script manually before importing the CSV.
 */

(function runCleanup() {
    var roleName = 'pps_resource';
    var ignoredChar = ':';
    
    // 1. Find all groups that have the pps_resource role
    var ghr = new GlideRecord('sys_group_has_role');
    ghr.addQuery('role.name', roleName);
    ghr.query();
    
    var groupIdsToClean = [];
    var ignoredCount = 0;
    
    while (ghr.next()) {
        var groupName = ghr.group.name.toString();
        
        // 2. Ignore groups that contain the specified character (':')
        if (groupName.indexOf(ignoredChar) === -1) {
            groupIdsToClean.push(ghr.group.toString());
        } else {
            ignoredCount++;
        }
    }
    
    if (groupIdsToClean.length > 0) {
        // 3. Find and delete all memberships for the targeted groups
        var members = new GlideRecord('sys_user_grmember');
        members.addQuery('group', 'IN', groupIdsToClean);
        members.query();
        
        var membershipCount = members.getRowCount();
        
        // Delete records
        // Note: deleteMultiple() is faster, but if you have custom business rules on sys_user_grmember 
        // that you want to bypass to speed things up, use a while loop with setWorkflow(false)
        members.setWorkflow(false); // Bypasses business rules/notifications for speed
        members.deleteMultiple();
        
        gs.info("Resource Group Pre-Cleanup: Successfully deleted " + membershipCount + 
                " memberships across " + groupIdsToClean.length + " pps_resource groups. " +
                "(Ignored " + ignoredCount + " groups containing '" + ignoredChar + "').");
    } else {
        gs.info("Resource Group Pre-Cleanup: No matching groups found to clean up. " +
                "(Ignored " + ignoredCount + " groups containing '" + ignoredChar + "').");
    }
    
})();
