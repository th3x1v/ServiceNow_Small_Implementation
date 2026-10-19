# Knowledge Base Article: How to Review and Cast Your CAB Vote During a Live Teams Meeting

**Article ID:** KB00XXXXX *(auto-generated)*  
**Category:** IT Service Management / Change Management  
**Target Audience:** CAB Members, Change Managers, Approvers  

---

## Overview

When a Normal Change receives an objection during asynchronous email review, it is placed on the agenda for our live **CAB Review Teams Meeting**. 

This guide explains how CAB members can open the Change Request and submit their vote directly during the Teams call.

---

## 3 Ways to Access and Cast Your Vote

### Option 1: Via the Employee Service Portal (Recommended & Easiest)

1. Open your browser and go to the **Service Portal** (e.g. `https://<your-instance>.service-now.com/sp` or `/esc`).
2. In the top navigation bar or homepage banner, click on **My Approvals** (or the Bell icon notifications).
3. Locate the Change Request number (e.g., **CHG0012345**).
4. Review the change details (Summary, Risk, Schedule, Backout Plan).
5. At the top right of the approval card:
   - Click **Approve** (green) to authorize the change.
   - Click **Reject** (red) if concerns remain, and enter your mandatory comments.

---

### Option 2: Directly on the Change Request Form (Fulfiller / Native UI)

1. During the Teams meeting, click the Change Request link shared in the chat or email (e.g. **CHG0012345**).
2. Scroll down to the **Related Lists** at the bottom of the Change Request form.
3. Click the **Approvers** tab.
4. Find the row listing your name with the state **Requested**:
   - Right-click (or click into) the record.
   - Click **Approve** or **Reject**.
   - If rejecting, enter comments explaining the reasoning in the prompt.

---

### Option 3: Via Your Email (1-Click Vote)

If you have the original approval notification or the meeting escalation notification in your Outlook:

1. Open the email for **Change Request [CHG00XXXXX]**.
2. Click the pre-formatted **Click here to approve** link.
3. An automatic reply email will open with your approval watermark.
4. Click **Send**.
5. ServiceNow processes your reply within seconds and flips your vote to **Approved**.

---

## How to Change Your Vote During the Meeting (Overturning a "No")

If you previously voted **Reject** (or want to update an earlier vote) after hearing clarifications and mitigations discussed during the Teams meeting:

1. **Open Your Approval Record:**
   * In the **Service Portal** (`/sp` or `/esc`) &rarr; **My Approvals**, click into the Change Request.
   * OR on the **Change Request form** &rarr; **Approvers** tab &rarr; open your approval record.
2. **Click "Change Vote to Approve" (or "Update Vote"):**
   * A prompt will ask for your **Reason for Vote Change**.
   * Enter a brief explanation of why your concern was resolved (e.g., *"Rollback script reviewed and verified during CAB meeting"*).
3. **Submit:**
   * Your approval state will change from **Rejected** to **Approved**.
   * **Audit Notice:** ServiceNow automatically logs an entry in the Change Request's permanent Work Notes / Activity Log recording your name, the timestamp, the previous vote, the new vote, and your justification for audit and compliance.

---

## What Happens After Everyone Approves?

* Once all remaining objections are resolved and all CAB members mark their approval, ServiceNow **automatically advances the change from Authorize to Scheduled**.
* The Change Owner is notified that implementation can proceed according to the planned schedule.

---

## Need Help or Missing Approval Rights?

If you are attending the meeting as a delegate or cannot see your approval record:
* Reach out to the **Change Management Team** in the Teams meeting chat or at `<CHANGE_MANAGER_EMAIL>`.
