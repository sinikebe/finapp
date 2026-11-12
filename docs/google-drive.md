# Google Drive backups

Finapp stores projects on the device by default. Connecting Google Drive is
optional. It adds versioned copies to the Google account you choose; the app
does not send project data to a Finapp server.

## Connect and save

1. Select the profile icon at the top right. Red means Google Drive is
   disconnected. Select **Connect to Google Drive**, choose your Google account
   and approve access to files created by Finapp. In production, sign-in opens
   a Google page and returns to Finapp. The consent screen's app name is set
   in Google Cloud separately from the Finapp interface.
2. Create a Finapp backup space or select one you created earlier. An existing
   Drive copy is compared before it replaces any local projects.
3. Select **Synchronize** to save or check for new versions. You can enable
   automatic synchronization for later saved changes while this tab is open,
   connected and online.

On `finapp.siniverse.cc`, an active session reconnects when you reopen the
application. Finapp obtains short-lived Google access tokens when needed and
keeps them only in memory; the separate session service holds a secure,
HttpOnly cookie and the refresh credentials. Use **Disconnect** to end that
session. Outside the production site, Google sign-in still requires a click
after reopening a tab. Finapp stores no access token, refresh token or account
identity in the browser's local storage. Your local projects and existing Drive
copies stay in place while disconnected.

## Review and recover

If Drive contains another version, open **Compare**. The review lists the
differences; you can keep the projects on this device, use the Drive version, or
merge them by choosing which side to retain for any conflict. The complete
workspace is checked before it is saved. A local recovery copy of the previous
workspace is created before a replacement; if that cannot be saved, the
replacement is refused. Earlier versions in Drive remain available in the
history, including when two devices edited the same backup.

The **Download a backup** and **Restore a backup** JSON commands in Tools remain
available without Google Drive. Downloading a separate JSON copy is useful for
long-term storage outside both the browser and Drive. Restoring an old JSON file
previews its projects and recovery drafts before replacing local projects.
Review Drive again after an import: an older Drive version may differ from the
restored local workspace.

## Accounts, privacy and environments

The Drive copy is private to the connected Google account unless you share it
using Google Drive. Finapp does not encrypt backup contents itself. Google
authorization uses the `drive.file` scope. On the production site, the session
service holds the client secret and refresh credential; it never receives the
backup contents. Browser requests go directly to Google Drive with a temporary
access token. On previews and local development, the legacy Google Identity
Services flow uses a public web OAuth client ID and memory-only access token.
Read the [privacy policy](https://siniverse.cc/confidentialite.html).

Finapp production uses its own Google OAuth project, separate from Garapp.
The `/dev/` preview uses a separate backup space and may use a different OAuth
client. Switching between applications does not copy projects. Backups created
with an earlier Google OAuth project remain in Drive but are not imported
automatically. If the production session service is temporarily unavailable,
Finapp can offer its previous Google sign-in flow on request; no remote backup
can replace local data during a failed connection.

If sign-in, permission, quota or connectivity prevents Drive access, the local
workspace and JSON export continue to work. Check the account and popup
permissions, or download a JSON backup before troubleshooting.
