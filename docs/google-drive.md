# Google Drive backups

Finapp stores projects on the device by default. Connecting Google Drive is
optional. It adds versioned copies to the Google account you choose; the app
does not send project data to a Finapp server.

## Connect and save

1. Select the profile icon at the top right. Red means Google Drive is disconnected.
   Select **Connect to Google Drive** if the account chooser does not open yet.
   Choose your Google account and approve access to files created by the
   Finapp application. Its name on the Google consent screen is set in
   the Google Cloud project, separately from the Finapp interface.
2. Create a Finapp backup space or select one you created earlier. An existing
   Drive copy is compared before it replaces any local projects.
3. Select **Synchronize** to save or check for new versions. You can enable
   automatic synchronization for later saved changes while this tab is open,
   connected and online.

After closing or reloading the tab, select the profile icon to reconnect. After
one successful manual connection, Finapp prepares Google sign-in in the
background so the next profile-icon click can open the account chooser directly.
Browsers require a click before opening that popup; merely opening the app
cannot launch it automatically. The connected account name and email address
appear in the profile controls while the connection is active. Finapp remembers
only that you connected before, until you explicitly disconnect: it keeps
neither your identity nor the access token in browser storage. Your local
projects and any existing Drive copies
stay in place while you are disconnected.

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
authorization uses the `drive.file` scope and a public web OAuth client ID;
there is no client secret in the page. Tokens stay in memory while the tab is
open. Sign in again when a new session starts.

Finapp production uses its own Google OAuth project, separate from Garapp.
The `/dev/` preview uses a separate backup space and may use a different OAuth
client. Switching between applications does not copy projects. Backups created
with an earlier Google OAuth project remain in Drive but are not imported
automatically.

If sign-in, permission, quota or connectivity prevents Drive access, the local
workspace and JSON export continue to work. Check the account and popup
permissions, or download a JSON backup before troubleshooting.
