# ServiceNow Asynchronous CAB Management Guide (Zero-Meeting Architecture)

This guide details how to implement a **pure asynchronous CAB review process** in ServiceNow without generating CAB Meeting records (`cab_meeting`), CAB Agenda Items (`cab_agenda_item`), or using the CAB Workbench.

---

## 1. Cleanup: Decommissioning CAB Meetings & Definitions

If you previously set up a CAB Definition and have test meetings, follow these steps to stop automatic meeting generation and purge unwanted test records.

### Step 1.1: Deactivate the CAB Definition
1. In the Filter Navigator, go to **Change > Change Advisory Board > CAB Definitions**.
2. Open your CAB Definition record.
3. Uncheck the **Active** checkbox.
4. Under the **Schedule** section, clear the schedule reference.
5. Click **Update**.
> [!NOTE]
> Deactivating the CAB Definition prevents ServiceNow's scheduled jobs (`CABDefinitionUtil`) from automatically creating upcoming `cab_meeting` records and pulling changes into agenda items.

### Step 1.2: Delete Existing Test CAB Meetings & Agenda Items
1. Navigate to **Change > Change Advisory Board > All CAB Meetings** (or type `cab_meeting.list` in the filter navigator).
2. Filter the list to locate your test meetings.
3. Select the checkboxes next to the test meetings.
4. At the bottom of the list, select **Action on selected rows > Delete**. Confirm deletion.
   *(Deleting the CAB Meeting record automatically cascades and removes all associated `cab_agenda_item` records.)*

> [!TIP]
> **Optional Scripted Purge via Background Scripts (`sys.scripts.do`):**
> If you have numerous test meeting records:
> ```javascript
> var grMeeting = new GlideRecord('cab_meeting');
> // Optional: grMeeting.addQuery('cab_definition.name', 'CONTAINS', 'Test');
> grMeeting.query();
> while (grMeeting.next()) {
>     grMeeting.deleteRecord(); // Cascades to cab_agenda_item
> }
> ```

---

## 2. Review Criteria & Approval Strategy

We are implementing **Option 3 (Hybrid Asynchronous Architecture)**:
1. **Real-time Event-Driven Approvals**: As soon as a Normal change enters `Authorize` and meets the date criteria, approval records are generated for `<CAB_APPROVAL_GROUP>`.
2. **Quorum Requirement**: **All members must approve**. If any member rejects, the change is rejected back for reassessment.
3. **Weekly Asynchronous Digest**: A scheduled job/flow compiles all active changes in `Authorize` for that planned window and sends a single consolidated digest email to `<CAB_APPROVAL_GROUP>` as a centralized dashboard/reminder.

### Filter Criteria
- **State**: `Authorize`
- **Type**: `Normal`
- **Planned start date**: `between last week and next week`

---

## 3. Implementation: Flow Designer & Change Approval Policy

You can implement the approval trigger using either **Change Approval Policies** (OOB modern framework) or directly within **Flow Designer**.

### Method A: Flow Designer Direct Flow (Recommended for full control)

1. Navigate to **Process Automation > Flow Designer**.
2. Open or create a subflow/flow for Normal Change Authorize (e.g., `Change - Normal - Authorize`).
3. **Trigger**:
   - Table: `Change Request [change_request]`
   - Condition: 
     - `State changes to Authorize`
     - AND `Type is Normal`
4. **Action 1: Check Planned Start Date Window**:
   - Add an **If** block:
     - `Trigger -> Change Request -> Planned start date` **between** `Last week` and `Next week`
5. **Action 2: Ask for Approval**:
   - Record: `Trigger -> Change Request`
   - Approval Conditions:
     - **Approve when**: **Everyone approves** from Group `<CAB_APPROVAL_GROUP>`.
     - **Reject when**: **Anyone rejects** from Group `<CAB_APPROVAL_GROUP>`.
6. **Action 3: Evaluate Decision**:
   - **If Approval State is Approved**:
     - Update Change Request Record: `State` -> `Scheduled` (Value `-2`).
     - Add Work note: *"All members of <CAB_APPROVAL_GROUP> approved the change asynchronously."*
   - **If Approval State is Rejected**:
     - Update Change Request Record: `State` -> `Assess` (Value `-4`) or `New` (Value `-5`).
     - Add Work note: *"Change rejected during asynchronous CAB review."*

---

### Method B: Change Approval Policy (OOB Enterprise Framework)

If your organization uses ServiceNow's Change Approval Policy engine:
1. Navigate to **Change > Administration > Change Approval Policies**.
2. Open **Normal Change Policy**.
3. Create a **Policy Decision**:
   - **Name**: `Normal Change - CAB Async Review`
   - **Condition**: 
     - `Type is Normal`
     - AND `Planned start date between last week and next week`
4. Under the Decision, add an **Approval Definition**:
   - **Approval Type**: `Group`
   - **Group**: `<CAB_APPROVAL_GROUP>`
   - **Wait for**: `ApprovesAll` (Requires 100% approval from all group members)
   - **Reject if**: `RejectsAny`

---

## 4. Asynchronous 1-Click Voting via Email

When the `Ask for Approval` action executes, ServiceNow creates `sysapproval_approver` records for each member of `<CAB_APPROVAL_GROUP>`.

### Step 4.1: Notification Configuration
1. Navigate to **System Notification > Email > Notifications**.
2. Locate the notification: **Change Request - Approval**.
3. Ensure it triggers when:
   - Table: `Approval [sysapproval_approver]`
   - Condition: `State changes to Requested` AND `Approval for.Task type is Change Request`.
4. Recipients:
   - Check **Approver** (`approver` field).

### Step 4.2: Email Template & 1-Click Action Links
In the email body, include the OOB `mailto` links for zero-friction voting directly from Outlook/Apple Mail/Webmail:
```html
<p>Change Request <strong>${sysapproval.number}</strong> requires your review and authorization.</p>

<table style="border-collapse: collapse; width: 100%;">
  <tr><td><strong>Short Description:</strong></td><td>${sysapproval.short_description}</td></tr>
  <tr><td><strong>Planned Start:</strong></td><td>${sysapproval.start_date}</td></tr>
  <tr><td><strong>Planned End:</strong></td><td>${sysapproval.end_date}</td></tr>
  <tr><td><strong>Risk / Impact:</strong></td><td>${sysapproval.risk} / ${sysapproval.impact}</td></tr>
  <tr><td><strong>Implementation Plan:</strong></td><td>${sysapproval.implementation_plan}</td></tr>
</table>

<p>Please review and cast your asynchronous vote:</p>
<p>
  <strong>${mailto:mailto.approval}</strong> | 
  <strong>${mailto:mailto.rejection}</strong>
</p>
<p>Or review full details in the portal: <a href="/sp?id=approval&table=sysapproval_approver&sys_id=${sys_id}">Open Approval Record</a></p>
```

### Step 4.3: Inbound Email Action Verification
1. Navigate to **System Policy > Email > Inbound Actions**.
2. Open **Update Approval Record**.
3. Verify that the action is **Active**.
4. When an approver clicks the "Approve" mailto link, their email client generates a reply with:
   - Subject: `Re: Change Request CHG00... - approve`
   - Body contains the ServiceNow watermark (e.g., `Ref:MSG...`)
5. The Inbound Action parses the watermark, sets `state = approved` on that user's `sysapproval_approver` record.

---

## 5. Scheduled Weekly CAB Review Digest (Replaces Meeting Agenda)

To give `<CAB_APPROVAL_GROUP>` a unified view of all upcoming changes without generating any meeting records, set up a scheduled digest flow.

### Step 5.1: Create Scheduled Flow in Flow Designer
1. Go to **Flow Designer > New Flow**.
2. **Name**: `CAB Weekly Asynchronous Review Digest`.
3. **Trigger**: `Scheduled` -> **Weekly** (e.g., Every Monday at 08:00 AM).
4. **Action 1: Look Up Records**:
   - Table: `Change Request [change_request]`
   - Conditions:
     - `State = Authorize`
     - `Type = Normal`
     - `Planned start date between last week and next week`
5. **Action 2: Check If Records Found**:
   - If `Look Up Records -> Count > 0`:
     - Send Email:
       - **To**: Group `<CAB_APPROVAL_GROUP>`
       - **Subject**: `Weekly CAB Asynchronous Review Packet - [Count] Pending Changes`
       - **Body**: Table containing Change Number, Short Description, Assigned To, Risk, Planned Start Date, and direct link to each Change record.
   - If `Count == 0`:
     - (Optional) Send "No changes require CAB review this week" or do nothing.

---

## 6. Summary of Asynchronous Lifecycle

```
[Normal Change: Assess] 
       │ (Risk evaluated, Planned Start Date set)
       ▼
[State moves to Authorize]
       │
       ├─► Meets Date Window? (last week to next week)
       │         │
       │         ├─► YES: Flow triggers CAB Approval
       │         │        ├─► sysapproval_approver created for all members of <CAB_APPROVAL_GROUP>
       │         │        ├─► Individual 1-click voting email dispatched to all members
       │         │        └─► Included in next Scheduled Weekly CAB Digest
       │         │
       │         └─► NO: Held or routed according to out-of-cycle rules
       │
[Asynchronous Voting]
       ├─► Every member replies via email ("Approve") or portal
       │
       ▼
[Quorum Reached: ALL Members Approved]
       │
       ▼
[State automatically moves to Scheduled]
```

No CAB Definition meetings, no agenda item records, and no live workbench required!
