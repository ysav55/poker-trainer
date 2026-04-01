# Poker Trainer — User Story Document

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Draft — Planning Use Only

---

## Overview

This document contains 100 user stories covering the full product arc of the Poker Trainer platform, from initial login through advanced administrative operations. Stories are grouped by functional area and numbered US-001 through US-100. Each story includes role context, acceptance criteria, and edge case considerations.

Roles in scope: Player, Trial, Moderator, Referee, Coach, Admin, Superadmin.

---

## 1. Authentication & Session

### US-001 — Player logs in for the first time
**Role:** Player
**Area:** Authentication & Session
**Story:** As a Player, I want to log in to the platform for the first time using my credentials so that I can access the lobby and begin training.
**Acceptance criteria:**
- A login screen is presented at the root URL when no active session exists
- Submitting valid username and password creates an authenticated session and redirects to the lobby
- An invalid credential combination displays a non-revealing error message ("Invalid username or password") without disclosing which field is incorrect
- After successful login, the player's display name and avatar appear in the top navigation bar
- The session persists across browser refreshes until explicit logout or expiry
- First-time login triggers a welcome modal or onboarding prompt
- The login form is keyboard-navigable and screen-reader accessible

---

### US-002 — Trial user accesses the lobby with restricted permissions
**Role:** Trial
**Area:** Authentication & Session
**Story:** As a Trial user, I want to log in with my trial credentials so that I can explore the lobby in read-only mode before committing to a full account.
**Acceptance criteria:**
- Trial credentials authenticate successfully and land the user on the lobby
- The Trial role badge is visible in the navigation bar
- Actions restricted to Trial users (joining tables, betting) are visually disabled with a tooltip explaining the restriction
- A persistent upgrade prompt or banner is shown encouraging conversion to a Player account
- Trial sessions expire after a configurable duration and redirect to a re-authentication page with an upgrade call to action

---

### US-003 — User logs out and session is cleared
**Role:** Player, Coach, Admin, Superadmin
**Area:** Authentication & Session
**Story:** As any authenticated user, I want to log out explicitly so that my session is terminated and no subsequent user can access my account on the same device.
**Acceptance criteria:**
- A logout control is accessible from the top navigation on every page
- Clicking logout invalidates the server-side session token immediately
- The browser is redirected to the login screen after logout
- Pressing the browser back button after logout does not reveal any authenticated page content
- Any open WebSocket connections (table, lobby) are closed upon logout

---

### US-004 — User session expires mid-activity
**Role:** Player
**Area:** Authentication & Session
**Story:** As a Player, I want to be gracefully redirected to the login page when my session expires mid-hand so that I understand what happened and can re-authenticate without losing context.
**Acceptance criteria:**
- When a session token expires, all API calls return a 401 response
- A non-blocking toast or modal informs the user that the session has expired
- The user is redirected to the login page with a query parameter indicating the originating route
- After successful re-authentication, the user is returned to the page they were on (deep-link restoration)
- If the user was at a table, their seat is held for a configurable grace period (e.g., 2 minutes) before being marked absent

---

### US-005 — Admin resets a user's password
**Role:** Admin, Superadmin
**Area:** Authentication & Session
**Story:** As an Admin, I want to reset a user's password from the User Management panel so that I can assist users who are locked out of their accounts.
**Acceptance criteria:**
- The User Management detail page contains a "Reset Password" action
- Triggering the reset sends a time-limited reset link to the user's registered email
- The Admin sees a confirmation that the reset email was dispatched
- The reset link expires after a configurable window (e.g., 24 hours)
- A used or expired reset link displays an appropriate error and offers to re-request
- The action is logged in the audit trail with the initiating Admin's identity

---

## 2. Lobby

### US-006 — Player views the lobby after login
**Role:** Player
**Area:** Lobby
**Story:** As a Player, I want to see the full lobby immediately after logging in so that I can quickly orient myself and choose a table or review my stats.
**Acceptance criteria:**
- The lobby renders a left sidebar, a stats row, a table grid, a recent hands section, and a playlists section
- The table grid shows all tables the Player has access to, with name, mode (coached cash, auto cash, tournament), player count, and status
- The stats row shows the Player's current chip count, win rate, and number of hands played
- The recent hands section lists the last 10 hands the Player participated in, with a link to hand review
- Playlists section shows playlists assigned to the player
- The page loads within 2 seconds under normal network conditions

---

### US-007 — Trial user sees a restricted lobby
**Role:** Trial
**Area:** Lobby
**Story:** As a Trial user, I want to see the lobby layout so that I understand the platform's structure, while being visually informed of which features are inaccessible.
**Acceptance criteria:**
- Trial users see the same lobby layout as Players
- Table join buttons are replaced with locked icons and a tooltip: "Upgrade to join tables"
- Playlist and recent hands sections are visible but entries show redacted content beyond the first item
- The stats row shows zeros or placeholder dashes since no activity has occurred
- No coach sidebar, admin link, or moderation controls appear

---

### US-008 — Player joins a table from the lobby
**Role:** Player
**Area:** Lobby
**Story:** As a Player, I want to click a table card in the lobby grid and be taken to that table's view so that I can participate in a hand.
**Acceptance criteria:**
- Each accessible table card has a "Join" button
- Clicking "Join" navigates to the table view and places the player in the first available seat
- If no seats are available, a "Watch" option is offered instead
- Private tables the Player is not invited to are not visible in the table grid
- If the table is in the middle of a hand, the player enters in observer mode and can join at the next hand boundary

---

### US-009 — Player views their own statistics in the stats row
**Role:** Player
**Area:** Lobby
**Story:** As a Player, I want to see my key statistics in the lobby stats row so that I can track my progress at a glance.
**Acceptance criteria:**
- Stats displayed include: total hands played, win rate percentage, net chip movement, and current session length
- Stats update in real time or at most with a 30-second lag
- Clicking any stat navigates to the full Stats & Analytics page filtered to that metric
- If the player has zero hands played, each stat shows a "—" placeholder with a prompt to play a hand

---

### US-010 — Player reviews recent hands from the lobby
**Role:** Player
**Area:** Lobby
**Story:** As a Player, I want to see a list of my recent hands in the lobby so that I can quickly revisit a hand for review without navigating away.
**Acceptance criteria:**
- The recent hands section lists up to 10 of the player's most recent hands, ordered newest first
- Each entry shows: date/time, table name, position, result (won/lost/folded), and any tags
- Clicking an entry opens the hand review overlay or navigates to the Hand Builder
- If fewer than 10 hands exist, the section shows available hands and a "Play more hands" prompt
- Hands from private sessions are included but marked with a lock icon

---

### US-011 — Player views assigned playlists in the lobby
**Role:** Player
**Area:** Lobby
**Story:** As a Player, I want to see the playlists assigned to me in the lobby sidebar so that I know what study material my coach has prepared.
**Acceptance criteria:**
- Assigned playlists appear in a dedicated section with title, hand count, and completion percentage
- Clicking a playlist opens the Playlist viewer in sequence
- Completed playlists are visually distinguished (e.g., checkmark, greyed-out)
- Unstarted playlists show a "Start" label; in-progress show "Continue"
- If no playlists are assigned, the section displays "No playlists assigned yet"

---

### US-012 — Moderator views the lobby and creates a table
**Role:** Moderator
**Area:** Lobby
**Story:** As a Moderator, I want to see all accessible tables in the lobby and create a new table so that I can organize training sessions without requiring an Admin.
**Acceptance criteria:**
- Moderators see the full table grid including all non-private tables
- A "Create Table" button is visible and enabled for Moderators
- The create table form allows setting: name, mode (auto cash or coached cash), blind levels, and maximum seats
- Upon creation, the table appears immediately in the lobby grid
- Moderators cannot create private (invite-only) tables — that option is greyed out with tooltip "Coach access required"
- Moderators do not see any admin navigation links in the sidebar

---

## 3. Table View — Player Betting Experience

### US-013 — Player places a bet during a hand
**Role:** Player
**Area:** Table view — player betting experience
**Story:** As a Player, I want to use the bet controls at my seat so that I can actively participate in the hand according to the current game state.
**Acceptance criteria:**
- When it is the player's turn, the action panel shows available actions: Fold, Check/Call, Bet/Raise with an amount input
- The amount input enforces minimum and maximum raise rules automatically
- Selecting an action and confirming sends the action to the server within 500ms
- The action is reflected immediately on the player's own UI optimistically, then confirmed by server state
- If the player's turn timer expires without action, a configurable default action (fold or check) is applied and a toast notifies the player
- Other players' actions are animated with deal/chip movement at the table

---

### US-014 — Player is disconnected during a hand
**Role:** Player
**Area:** Table view — player betting experience
**Story:** As a Player, I want the platform to handle my disconnection gracefully so that I do not lose my stack or disrupt the game unnecessarily.
**Acceptance criteria:**
- On WebSocket disconnection, the UI shows a "Reconnecting…" overlay with a spinner
- Automatic reconnection is attempted up to 5 times with exponential backoff
- If the player reconnects before their turn timer expires, they can still act
- If the timer expires during disconnection, the default action is applied and the hand continues
- Upon reconnection, the full current game state is synced from the server
- Other players at the table see the disconnected player's seat marked with a disconnection indicator

---

### US-015 — Player observes a hand in progress
**Role:** Player
**Area:** Table view — player betting experience
**Story:** As a Player who arrives at a table mid-hand, I want to watch the current hand as an observer so that I can join at the next hand without disrupting play.
**Acceptance criteria:**
- Observers see the table layout, current community cards, and pot size
- Observer mode shows chip stacks but hides hole cards for active players (privacy maintained)
- A "Join Next Hand" button is available and queues the observer to be seated at the next hand boundary
- The observer chat or reaction panel (if enabled) is available
- When the hand ends, the queued observer is automatically seated and dealt in

---

### US-016 — Player views their hole cards privately
**Role:** Player
**Area:** Table view — player betting experience
**Story:** As a Player, I want to see only my own hole cards so that the secrecy of the hand is maintained even in a shared-screen coaching context.
**Acceptance criteria:**
- Hole cards are visible only when the authenticated user's seat is the card owner
- Other players' hole cards are shown face-down until a showdown
- At showdown, cards are revealed for all players who did not fold
- If a coached cash mode hand ends without showdown, only the winner's cards are revealed (or no cards, per coach configuration)
- The player can toggle a "Hide my cards" mode to prevent screen-sharing leaks (cards show as back-face when this toggle is on)

---

## 4. Table View — Coached Cash Mode

### US-017 — Coach starts a coached cash mode session
**Role:** Coach
**Area:** Table view — coached cash mode
**Story:** As a Coach, I want to initiate a coached cash game so that I control the pace of dealing and can pause between hands for instruction.
**Acceptance criteria:**
- From the Coach Sidebar GAME tab, a "Deal" button is visible and enabled when all seated players are ready
- Clicking "Deal" distributes hole cards to all seated players and begins the hand
- The coach can pause the hand between streets (pre-flop, flop, turn, river) by not advancing the deal
- Players are shown a "Waiting for coach" state when paused
- The coach can narrate or annotate during pauses using the sidebar tools
- The deal button is disabled if fewer than 2 players are seated

---

### US-018 — Coach sets blinds before a hand
**Role:** Coach
**Area:** Table view — coached cash mode
**Story:** As a Coach, I want to set the small blind and big blind amounts before each hand so that I can vary the training scenario stakes.
**Acceptance criteria:**
- The GAME tab in the Coach Sidebar shows current blind levels with editable fields
- Blind changes take effect on the next hand dealt, not the current one
- If a blind change is applied mid-deal, an error is shown and the change is queued
- Blinds must be positive integers and the big blind must be at least twice the small blind
- The coach can save a blind preset for reuse within the session

---

### US-019 — Coach undoes the last deal action
**Role:** Coach
**Area:** Table view — coached cash mode
**Story:** As a Coach, I want to undo the most recent deal action so that I can correct a mistake (e.g., dealt the wrong street) without ending the session.
**Acceptance criteria:**
- An "Undo" button is visible in the GAME tab, enabled when at least one deal action has been taken
- Clicking Undo reverts the game state to before the last deal action (e.g., removes the river card and returns to turn state)
- All players' UIs update to reflect the reverted state within 500ms
- Undo cannot be applied to player betting actions (only to coach-controlled deal actions)
- After an undo, the coach can re-deal the same street with new cards

---

### US-020 — Coach adjusts a player's stack mid-session
**Role:** Coach
**Area:** Table view — coached cash mode
**Story:** As a Coach, I want to manually adjust any player's chip stack during a session so that I can set up specific scenario starting conditions.
**Acceptance criteria:**
- The GAME tab lists all seated players with their current chip stacks
- Clicking a player's stack value opens an inline edit field
- The coach enters a new stack value and confirms; the change takes effect at the next hand boundary
- Negative stack values are rejected with an inline error
- The adjustment is logged in the session history with the coach's name and timestamp
- The affected player sees a toast notification: "Your stack has been adjusted by [Coach Name]"

---

### US-021 — Coach removes a player from the table
**Role:** Coach
**Area:** Table view — coached cash mode
**Story:** As a Coach, I want to remove a player from the table mid-session so that I can manage disruptive behaviour or reassign the player to another table.
**Acceptance criteria:**
- Each player row in the GAME tab has a "Remove" action (kebab menu or button)
- Clicking Remove shows a confirmation dialog: "Remove [Player Name] from this table?"
- On confirmation, the player's connection to the table is terminated and they are returned to the lobby
- The removed player sees a message: "You have been removed from the table by [Coach Name]"
- The seat is marked vacant and the next hand proceeds without that seat
- The removal is logged in the session history

---

## 5. Table View — Auto Cash Mode

### US-022 — Auto cash mode deals hands automatically
**Role:** Player, Coach
**Area:** Table view — auto cash mode
**Story:** As a Player in auto cash mode, I want hands to be dealt automatically after a configurable timer so that the game flows without requiring manual coach intervention.
**Acceptance criteria:**
- After all players complete their actions in a hand, a countdown timer starts (configurable, default 10 seconds)
- When the timer reaches zero, a new hand is dealt automatically
- Players can click "Deal Now" to skip the countdown if all players are ready
- The coach, seated as a player, participates in betting like any other player
- There is no coach-only GAME tab deal control in auto cash mode; the coach sidebar is limited to tagging and playlists

---

### US-023 — Coach tags a hand in auto cash mode
**Role:** Coach
**Area:** Table view — auto cash mode
**Story:** As a Coach playing in auto cash mode, I want to tag the current hand with a concept label so that I can review it later in the hand library.
**Acceptance criteria:**
- A tag icon or button is available in the Coach Sidebar HANDS tab during auto cash mode
- Clicking it opens a tag picker showing the platform's standard taxonomy (e.g., "3-bet pot", "bluff catch", "squeeze play")
- The coach can select multiple tags per hand
- Tags are saved immediately and associated with the hand record
- Tagged hands appear in the HANDS tab library with their tags visible
- Non-coach roles cannot access the tag controls

---

## 6. Table View — Tournament Mode

### US-024 — Referee starts a tournament session
**Role:** Referee
**Area:** Table view — tournament mode
**Story:** As a Referee, I want to start a tournament from a saved template so that the blind schedule and seating are configured automatically.
**Acceptance criteria:**
- The Referee accesses Tournament Management and selects a saved template
- Clicking "Start Tournament" creates all required tables and seats players according to the template's seating plan
- The blind schedule begins at level 1 and a countdown timer is displayed showing time remaining in the current level
- All participating players receive a notification (lobby toast or push) that the tournament has started
- The multi-table view at /multi is automatically populated with all tournament tables
- If the minimum player count (per template) is not met, start is blocked with an error

---

### US-025 — Blind level advances automatically in tournament
**Role:** Referee, Player
**Area:** Table view — tournament mode
**Story:** As a Player in a tournament, I want the blind level to advance automatically on schedule so that the tournament progresses without manual Referee intervention.
**Acceptance criteria:**
- A visible countdown shows time remaining in the current blind level
- When the timer expires, the blind level increments to the next level in the schedule
- The new blind amounts are displayed prominently on the table and in a toast notification
- If a hand is in progress when the level timer expires, the new blinds take effect on the next hand
- The Referee can manually advance the blind level from the Tournament Management panel
- A level-up sound or animation cues all players

---

### US-026 — Player is eliminated from a tournament
**Role:** Referee, Player
**Area:** Table view — tournament mode
**Story:** As a Player whose stack reaches zero in a tournament, I want to be formally eliminated and shown my finishing position so that the results are accurately recorded.
**Acceptance criteria:**
- When a player's chip count hits zero, the Referee panel (and auto-logic) triggers an elimination event
- The eliminated player sees a modal: "You have been eliminated in position [N]"
- The player is removed from their seat and returned to the lobby or a tournament spectator view
- The elimination is logged with timestamp and hand reference in the Tournament Management panel
- The remaining player count updates in the multi-table broadcast bar
- The Referee can manually record an elimination in edge cases (e.g., rule dispute)

---

### US-027 — Referee manages table consolidation during tournament
**Role:** Referee
**Area:** Table view — tournament mode
**Story:** As a Referee, I want to consolidate players from a short-handed table into other tables so that the tournament maintains full tables as players are eliminated.
**Acceptance criteria:**
- The Referee panel shows a "Consolidate Table" action when a table falls below a configurable player threshold (e.g., 3 players)
- Selecting consolidation moves specified players to open seats at another active tournament table
- Affected players see a notification: "You are being moved to Table [X], Seat [Y]"
- The vacated table is closed and removed from the multi-table view
- Player chip stacks are preserved exactly through the move
- The action is logged in the tournament audit trail

---

### US-028 — Coach creates a tournament table for invited students only
**Role:** Coach
**Area:** Table view — tournament mode
**Story:** As a Coach, I want to create a private tournament table visible only to invited students so that I can run a focused tournament session with a specific cohort.
**Acceptance criteria:**
- From Stable Management or Tournament Management, the Coach can toggle "Private (Invite Only)" when creating a tournament
- An invitation list allows the Coach to search and select specific players from their stable
- Only invited players see the tournament table in their lobby grid
- Uninvited players searching or guessing the table URL are shown a "Table not found" or "Access denied" message
- The Coach can add or remove invitees before the tournament starts
- After the tournament starts, the invitation list is locked (no new players can be added without Coach action)

---

## 7. Coach Sidebar

### US-029 — Coach views and controls the GAME tab
**Role:** Coach
**Area:** Coach Sidebar
**Story:** As a Coach, I want the GAME tab of the sidebar to give me full control over the current session so that I can direct the training without leaving the table view.
**Acceptance criteria:**
- The GAME tab is the default tab when a Coach joins a coached cash table
- Visible controls include: Deal, Pause/Resume, Undo Last Action, Set Blinds, and End Session
- The Players section lists all seated players with name, stack, seat number, and a context menu per player
- Blind fields are editable inline with immediate save-on-blur
- All actions have loading states and error handling (e.g., if Deal fails due to server error, the coach sees a retry prompt)

---

### US-030 — Coach reviews the hand library in the HANDS tab
**Role:** Coach
**Area:** Coach Sidebar
**Story:** As a Coach, I want to browse the hand library from the sidebar HANDS tab so that I can load a saved hand into the current session for review.
**Acceptance criteria:**
- The HANDS tab shows two sub-sections: Library (saved/built hands) and History (hands played in the current session)
- The Library supports search by tag, date, and player name
- Clicking a hand in the Library opens a preview panel with street-by-street replay
- The coach can "Load" a hand into the current session from the preview
- The History list updates in real time as hands are completed during the session
- Hands can be tagged from within the HANDS tab

---

### US-031 — Coach manages playlists from the PLAYLISTS tab
**Role:** Coach
**Area:** Coach Sidebar
**Story:** As a Coach, I want to access and assign playlists from the sidebar PLAYLISTS tab during a session so that I can push study material to players without leaving the table.
**Acceptance criteria:**
- The PLAYLISTS tab lists all playlists the Coach owns or has edit access to
- The Coach can assign any playlist to any player currently at the table by selecting the player and clicking "Assign"
- Assignment triggers a notification for the receiving player in the lobby and their player stats row
- The Coach can preview a playlist's hand sequence from within the tab
- New hands from the current session can be appended to a playlist directly from the HANDS tab

---

### US-032 — Moderator uses a limited sidebar
**Role:** Moderator
**Area:** Coach Sidebar
**Story:** As a Moderator, I want access to hand tagging and table management controls in the sidebar without having coach-level instructional authority so that I can assist in session management.
**Acceptance criteria:**
- Moderators see a sidebar with access to: hand tagging (HANDS tab) and basic table controls (pause/resume/remove player)
- Moderators do not see the PLAYLISTS tab (Coach access required)
- Moderators cannot adjust player stacks
- Moderators cannot load hands from the library into the session (view-only)
- The sidebar clearly labels itself as "Moderator View" to distinguish it from the full Coach Sidebar
- Any action a Moderator cannot perform shows a lock icon and tooltip explaining the required role

---

## 8. Stable Management

### US-033 — Coach views the stable roster
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach, I want to see a roster of all my students in Stable Management so that I can monitor who is online and where they are in the platform.
**Acceptance criteria:**
- The Stable Management page lists all players assigned to the coach's stable, one per row
- Each row shows: player name, avatar, online status (online/offline/away), current location (lobby, table name, or offline)
- The list is sortable by name, status, and current location
- Online status updates in real time via WebSocket push
- If the stable has no players, an empty state prompts the Coach to invite students
- The coach can click a player row to open that player's CRM entry

---

### US-034 — Coach assigns seats before a hand starts
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach, I want to assign specific seats to specific players before a hand begins so that I can control the positional dynamics of a training scenario.
**Acceptance criteria:**
- From the Stable Management page, the Coach selects a table and sees a seat assignment panel
- Each seat slot can be assigned to any online player in the stable via a dropdown or drag-and-drop
- Seat assignments are locked once the hand is dealt; attempting to reassign during a hand shows an error
- Players receive a notification of their assigned seat: "Coach [Name] has assigned you to Seat [N] at [Table Name]"
- Unassigned seats remain open for players to self-select
- The coach can clear all assignments and start over with a "Reset Seats" action

---

### US-035 — Coach creates a private table from Stable Management
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach, I want to create an invite-only table directly from Stable Management so that I can set up a private session for a selected group of students.
**Acceptance criteria:**
- A "Create Private Table" button is available in Stable Management
- The creation form includes: table name, mode (coached cash / auto cash / tournament), blind levels, and an invitee picker populated from the stable roster
- Only invited players see the table in the lobby; it is invisible to all others
- The table creator (Coach) is automatically assigned host privileges
- Upon creation, invited players receive a lobby notification: "You have been invited to [Table Name] by [Coach Name]"
- The Coach can edit the invitation list after creation until the first hand is dealt

---

### US-036 — Coach assigns a session to a student
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach, I want to assign a named session to a student from Stable Management so that the session's hands and playlists are tracked against that student's training plan.
**Acceptance criteria:**
- From a student's row in the roster, the Coach can select "Assign Session"
- A session picker shows existing session templates or allows creating a new named session
- The assigned session appears in the student's CRM SCHEDULE tab
- Hands played during an assigned session are tagged with the session name in the player's history
- The Coach can unassign a session before it starts; after it starts, unassignment archives the session record
- A student can see their assigned sessions in the lobby but cannot edit them

---

### US-037 — Coach monitors which students are online in real time
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach preparing a session, I want to see which students are currently online so that I can send targeted invitations and avoid waiting for absent students.
**Acceptance criteria:**
- Online students are shown with a green status indicator; offline with grey; away with amber
- The list auto-updates without requiring a manual refresh
- The coach can filter the roster to show "Online only"
- Clicking an online student opens a quick action menu: "Invite to Table", "Open CRM", "Send Message" (if messaging is enabled)
- The last-seen timestamp is shown for offline students
- The count of online/offline students is summarised at the top of the roster (e.g., "4 of 12 online")

---

### US-038 — Player views private table invitation in the lobby
**Role:** Player
**Area:** Stable Management
**Story:** As a Player who has been invited to a private table, I want to see that invitation clearly in my lobby so that I know where to go for my coach's session.
**Acceptance criteria:**
- The invited private table appears in the lobby table grid with a "Private — Invited" badge
- A notification banner or bell icon shows the invitation when the player logs in
- The player can accept (join) or decline the invitation from the lobby
- Declining removes the table from the player's grid and notifies the coach
- If the player does not respond within a configurable time window, the invitation expires and the coach is notified
- Uninvited players at the same platform cannot see or access the private table

---

## 9. Hand Builder & Scenarios

### US-039 — Coach builds a hand scenario from scratch
**Role:** Coach
**Area:** Hand Builder & Scenarios
**Story:** As a Coach, I want to use the Hand Builder to construct a hand scenario step by step so that I can create precise training situations that do not rely on random deals.
**Acceptance criteria:**
- The Hand Builder provides a visual table interface where the coach sets: number of players, positions, stack sizes, hole cards for each player, and community cards street by street
- Each street (pre-flop, flop, turn, river) is configured independently and can be advanced or reset
- Betting actions can be scripted (e.g., "UTG raises 3BB, BTN calls") and replayed in sequence
- The built hand can be saved to the Hand Library with a title, description, and tags
- Saved hands appear immediately in the Coach Sidebar HANDS tab for use in sessions
- The builder validates logical consistency (e.g., cannot assign the same card to two players)

---

### US-040 — Coach edits an existing hand scenario
**Role:** Coach
**Area:** Hand Builder & Scenarios
**Story:** As a Coach, I want to edit a previously built hand scenario so that I can refine the setup based on session feedback.
**Acceptance criteria:**
- From the Hand Library, the Coach can open any owned hand in the Hand Builder with "Edit"
- All fields are pre-populated with the saved state
- Saving creates a new version, preserving the previous version in history
- The Coach can name versions or annotate the change
- Edits are not immediately applied to sessions that have already loaded the hand; only future loads use the updated version
- A "Revert to Original" option is available if versioning is supported

---

### US-041 — Moderator tags a hand during a session
**Role:** Moderator
**Area:** Hand Builder & Scenarios
**Story:** As a Moderator, I want to tag a hand that just concluded with relevant concept labels so that it can be categorised in the library for later coach review.
**Acceptance criteria:**
- The tag control is accessible from the Moderator's sidebar HANDS tab
- Tag picker presents the platform's taxonomy; the Moderator can select one or more tags
- Tags are saved immediately and the hand appears in the library with those tags
- The Moderator cannot delete or edit previously saved hands (view + tag only)
- Tags applied by a Moderator are attributed to the Moderator's account in the hand record
- A Coach or Admin can remove a Moderator-applied tag if incorrect

---

### US-042 — Player reviews a hand scenario in playback mode
**Role:** Player
**Area:** Hand Builder & Scenarios
**Story:** As a Player, I want to watch a hand scenario play back street by street so that I can study the decision points at my own pace.
**Acceptance criteria:**
- Playback mode shows a visual table with cards, bets, and positions advancing on each click or auto-play timer
- The player can pause, rewind to any street, and replay specific segments
- For scenario hands, the player's own cards (if assigned) are revealed; opponents' hole cards are shown only at showdown or per coach configuration
- A notes panel alongside the playback displays any coach annotations tied to specific streets
- Playback is available from the lobby's recent hands section and from assigned playlists
- The player cannot alter the hand record during playback

---

## 10. Playlists

### US-043 — Coach creates a new playlist
**Role:** Coach
**Area:** Playlists
**Story:** As a Coach, I want to create a named playlist of hands so that I can organise training material into a structured learning sequence.
**Acceptance criteria:**
- The Playlists management page has a "New Playlist" button
- The creation form requires a title and allows an optional description and thumbnail tag
- Hands are added from the library using a search/filter and drag-to-order interface
- The playlist can be saved as a draft (not yet assigned to any player) or published immediately
- Published playlists can be assigned to one or more players from the Stable Management page or the Coach Sidebar
- The playlist creation form is accessible from within the Coach Sidebar PLAYLISTS tab

---

### US-044 — Coach reorders hands within a playlist
**Role:** Coach
**Area:** Playlists
**Story:** As a Coach, I want to drag and reorder hands within a playlist so that the learning sequence reflects my intended pedagogy.
**Acceptance criteria:**
- Hands in the playlist editor are displayed as a vertical ordered list with drag handles
- Dragging a hand to a new position updates the sequence immediately on drop
- The reordering is persisted on save (explicit Save button or auto-save with debounce)
- Keyboard-based reordering (using arrow keys with focus) is supported for accessibility
- The sequence number is displayed next to each hand and updates dynamically during drag
- If a playlist is currently being played by a student, reordering takes effect from the next hand forward, not mid-playback

---

### US-045 — Player completes a playlist and sees progress
**Role:** Player
**Area:** Playlists
**Story:** As a Player, I want to track my progress through an assigned playlist so that I feel a sense of completion and know what remains.
**Acceptance criteria:**
- Each hand in the playlist has a "completed" state toggled when the player finishes viewing or answering (per hand type)
- A progress bar on the playlist card in the lobby shows percentage complete
- Upon completing the final hand, a completion modal congratulates the player and offers to return to the lobby or review the playlist
- Completion is recorded in the player's history and visible to the Coach in the CRM HISTORY tab
- The Coach is notified (inbox or dashboard) when a student completes a playlist
- Progress is not reset if the coach later reorders the playlist; completed hands remain complete

---

### US-046 — Coach duplicates a playlist
**Role:** Coach
**Area:** Playlists
**Story:** As a Coach, I want to duplicate an existing playlist so that I can create a variant without rebuilding the sequence from scratch.
**Acceptance criteria:**
- A "Duplicate" action is available on each playlist card in the management view
- The duplicate is created with the title "[Original Title] — Copy" and can be immediately renamed
- The duplicate contains the same hand sequence as the original but is not assigned to any players
- Tags and descriptions are copied; assigned-student relationships are not copied
- The duplicate is owned by the creating Coach and appears in their playlist library immediately

---

## 11. Player CRM

### US-047 — Coach views a player's CRM OVERVIEW tab
**Role:** Coach
**Area:** Player CRM
**Story:** As a Coach, I want to view the OVERVIEW tab of a player's CRM so that I can quickly assess their overall performance and recent activity.
**Acceptance criteria:**
- The OVERVIEW tab shows: total hands played, win rate, VPIP, PFR, aggression factor, and net chip movement
- A trend chart shows performance over the last 30 days
- Recent session summaries (last 5 sessions) are listed with date, table, and result
- Tags most frequently applied to the player's hands are shown as a word cloud or bar chart
- The OVERVIEW data is read-only for the Coach; no editing from this tab
- Admin users also have access to the CRM for any player on the platform

---

### US-048 — Coach adds a note in the player CRM NOTES tab
**Role:** Coach
**Area:** Player CRM
**Story:** As a Coach, I want to write and save notes about a student in the NOTES tab so that I have a private record of observations to refer to in future sessions.
**Acceptance criteria:**
- The NOTES tab provides a rich-text editor for composing notes
- Notes are saved with author name, timestamp, and optional hand reference link
- Multiple notes can exist; they are displayed as a chronological feed
- Notes are private to the Coach (and Admins); the Player cannot view them
- The coach can edit or delete their own notes; Admin can delete any note
- Notes support @-mentioning a hand ID to create a cross-reference link

---

### US-049 — Coach schedules a session in the CRM SCHEDULE tab
**Role:** Coach
**Area:** Player CRM
**Story:** As a Coach, I want to schedule future sessions for a student in the SCHEDULE tab so that both of us have a shared calendar reference.
**Acceptance criteria:**
- The SCHEDULE tab shows a calendar or list view of upcoming and past sessions
- The Coach can create a new scheduled session with: date/time, duration, table mode, and notes
- Scheduled sessions generate a reminder notification for the player 30 minutes before (configurable)
- Completed sessions are marked with outcome notes and archived below the calendar
- The player can see their own schedule in a read-only view from their lobby
- Sessions can be cancelled or rescheduled; affected players are notified

---

### US-050 — Coach views a player's session history in the CRM HISTORY tab
**Role:** Coach
**Area:** Player CRM
**Story:** As a Coach, I want to review a complete hand-by-hand history for a player from the CRM HISTORY tab so that I can identify patterns in their decision-making over time.
**Acceptance criteria:**
- The HISTORY tab lists all hands the player has participated in, ordered newest first
- Filters allow narrowing by: date range, table name, session, and tags
- Each entry shows: hand date, position, result, tags, and a link to hand review
- Clicking a hand opens a read-only playback of that hand
- Export to CSV is available for the Coach and Admin roles
- Pagination or infinite scroll handles large histories without performance degradation

---

### US-051 — Admin accesses any player's CRM
**Role:** Admin
**Area:** Player CRM
**Story:** As an Admin, I want to access the CRM of any player on the platform so that I can support coaches, investigate disputes, and oversee player welfare.
**Acceptance criteria:**
- From User Management, the Admin can navigate to any player's CRM
- All four tabs (OVERVIEW, NOTES, SCHEDULE, HISTORY) are accessible to the Admin
- The Admin can view but not edit Coach-authored notes unless the note is flagged for Admin review
- Admin access to a CRM is logged in the audit trail
- The CRM header displays the player's role, join date, and account status
- Admin cannot impersonate the player or take actions on their behalf from the CRM view

---

## 12. Tournament Management

### US-052 — Coach builds a tournament template
**Role:** Coach
**Area:** Tournament Management
**Story:** As a Coach, I want to build a reusable tournament template defining the blind schedule, starting stacks, and structure so that I can launch consistent tournaments without reconfiguring each time.
**Acceptance criteria:**
- The Tournament Management page has a "New Template" builder form
- The form collects: template name, starting stack, buy-in (for tracking), number of players, and blind schedule (level duration, small blind, big blind, ante per level)
- Levels can be added, removed, and reordered within the schedule
- The template can be saved and appears in the template library for future use
- The template can be used to launch a tournament directly from the template library
- Templates are scoped to the creating Coach; Admins can see all templates

---

### US-053 — Referee tracks eliminations during a tournament
**Role:** Referee
**Area:** Tournament Management
**Story:** As a Referee, I want to record player eliminations in real time so that the finishing positions are accurately logged and prize calculations (if any) can be made.
**Acceptance criteria:**
- The Referee sees a live player list in the Tournament Management panel ordered by current chip count
- When a player is eliminated, the Referee can click "Eliminate" next to the player's name
- A confirmation prompt asks for the eliminating hand reference (optional)
- The elimination is recorded with: player name, finishing position, chip count at elimination, and timestamp
- The eliminated player's row moves to an "Eliminated" section with their position shown
- The remaining player count decrements in the broadcast bar visible at /multi

---

### US-054 — Referee ends a tournament and records results
**Role:** Referee
**Area:** Tournament Management
**Story:** As a Referee, I want to formally end a tournament and record the final standings so that results appear in the Stats & Analytics leaderboard.
**Acceptance criteria:**
- The "End Tournament" button is enabled when only one player remains (or the Referee manually triggers it)
- On confirmation, the tournament status is set to "Completed" and final standings are saved
- Final standings include: position, player name, chips at elimination (or final stack for winner), and time of elimination
- Results are immediately reflected in the Stats & Analytics leaderboard
- All participating players receive a notification with their finishing position
- The tournament record is archived and accessible from the Tournament Management history view

---

### US-055 — Referee applies a rule exception during a tournament
**Role:** Referee
**Area:** Tournament Management
**Story:** As a Referee, I want to apply a rule exception (e.g., awarding chips to a player due to a misdeal) so that I can maintain fairness without restarting the tournament.
**Acceptance criteria:**
- The Referee panel has an "Exception" action available per player during an active tournament
- Exception types include: award chips, deduct chips, and undo elimination
- Each exception requires a mandatory reason field
- Exceptions are prominently logged in the tournament audit trail with the Referee's name, timestamp, and reason
- The affected player sees a notification of the exception outcome
- Exceptions above a configurable chip threshold require Admin approval before taking effect

---

### US-056 — Coach views blind schedule progress during a tournament
**Role:** Coach
**Area:** Tournament Management
**Story:** As a Coach observing a tournament session, I want to see the full blind schedule with the current level highlighted so that I can anticipate upcoming pressure points for coaching commentary.
**Acceptance criteria:**
- The tournament sidebar or panel shows all blind levels as a table: level number, small blind, big blind, ante, duration
- The current level is highlighted and a countdown shows time remaining
- Past levels are greyed out; future levels are styled normally
- The coach can expand the schedule to full screen for projection or screen-share
- The schedule view is read-only for the Coach (edit is only available from the template builder before the tournament starts)

---

## 13. Multi-Table View

### US-057 — Admin watches all tables at once from /multi
**Role:** Admin, Coach, Superadmin
**Area:** Multi-Table view
**Story:** As an Admin, I want to navigate to /multi and see all active tables in a grid so that I can monitor the platform's overall activity at a glance.
**Acceptance criteria:**
- The /multi page renders a responsive grid of all currently active tables
- Each table cell shows: table name, mode, player count, current pot size, and current street
- The grid updates in real time without requiring a page refresh
- Clicking a table cell opens a larger preview or navigates to the full table view
- Empty tables (no active hand) are shown with a "Waiting" state
- The broadcast bar at the top of /multi shows: active table count, total player count, and current tournament status (if any)

---

### US-058 — Coach uses the broadcast bar to send an announcement
**Role:** Coach
**Area:** Multi-Table view
**Story:** As a Coach, I want to type a message in the broadcast bar on the /multi page so that all players across all tables receive the announcement simultaneously.
**Acceptance criteria:**
- The broadcast bar at the top of /multi has a text input field and a "Send" button
- Messages are limited to 280 characters
- Clicking Send broadcasts the message to all connected players as a toast notification
- The broadcast history is shown below the bar, ordered newest first, with sender name and timestamp
- Players at individual table views also receive the broadcast as a top-of-screen banner
- Non-coach roles can see the broadcast bar history but cannot send messages

---

### US-059 — Referee monitors all tournament tables from /multi
**Role:** Referee
**Area:** Multi-Table view
**Story:** As a Referee managing a multi-table tournament, I want the /multi view to show only tournament tables when a tournament is active so that I can focus on the event.
**Acceptance criteria:**
- A filter toggle on /multi allows switching between "All Tables" and "Tournament Only" views
- In "Tournament Only" view, only tables belonging to the active tournament are shown
- Each tournament table cell shows: table number, player count, chip leader's stack, and blind level
- The broadcast bar in tournament mode pre-fills a "[Tournament]" prefix to announcements
- Referee-specific actions (advance blind, mark elimination) are accessible via a hover overlay on each table cell
- The view is accessible to Referees, Coaches, Admins, and Superadmins

---

## 14. User Management

### US-060 — Admin creates a new user account
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to create a new user account from the User Management panel so that I can onboard students and staff without requiring self-registration.
**Acceptance criteria:**
- The User Management page has a "New User" button
- The creation form requires: username, email, initial role (Player/Trial/Moderator), and sends an invitation email
- The new user appears immediately in the user list with "Invited" status
- The invitation email contains a time-limited link for the user to set their password
- If the email address is already registered, an inline error prevents duplicate account creation
- Account creation is logged in the audit trail with the creating Admin's identity

---

### US-061 — Admin edits an existing user's profile
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to edit a user's profile fields (name, email, avatar) from User Management so that I can correct errors or update information on behalf of users.
**Acceptance criteria:**
- Clicking a user row in the list opens an edit panel or modal
- Editable fields include: display name, email address, and avatar (upload or URL)
- Changing an email address sends a verification link to the new email before the change is committed
- All profile edits are logged in the audit trail
- Admins cannot edit another Admin's or a Superadmin's profile; those require Superadmin access
- A "Cancel" action discards all unsaved edits without prompting for confirmation (with unsaved-changes warning on navigating away)

---

### US-062 — Admin suspends a user account
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to suspend a user account so that the user is prevented from logging in while the account is retained for record-keeping.
**Acceptance criteria:**
- A "Suspend" action is available in the user's detail panel
- Suspending a user immediately invalidates all their active sessions
- The user's account row is marked with a "Suspended" badge in the user list
- A suspended user attempting to log in sees the message: "Your account has been suspended. Please contact support."
- The Admin must provide a reason for suspension; the reason is logged and not shown to the user
- Suspended users can be reinstated with a "Reinstate" action, which restores all prior role assignments

---

### US-063 — Admin deletes a user account
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to permanently delete a user account so that the user's personal data is removed in compliance with a deletion request.
**Acceptance criteria:**
- A "Delete Account" action is available in the user's detail panel, behind a confirmation dialog requiring the Admin to type the username
- Deletion anonymises or removes all personally identifiable information associated with the account
- Hand history records are retained but attributed to "[Deleted User]"
- The deletion is recorded in the audit trail with the Admin's identity and a timestamp
- Deleting a user who is currently online first suspends them (auto-logout) before deletion
- Admins cannot delete Superadmin accounts; that action is blocked with an error

---

### US-064 — Admin searches and filters the user list
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to search and filter the user list so that I can quickly locate specific users in a large platform.
**Acceptance criteria:**
- A search bar filters users by name or email in real time (debounced, fires after 300ms of inactivity)
- Filter dropdowns allow narrowing by: role, account status (active/suspended/invited), and date joined
- The current filter combination is reflected in the URL query string for shareability
- Clearing all filters restores the full user list
- The total count of filtered results is shown above the list
- Pagination or virtual scroll handles lists of 1000+ users without performance degradation

---

### US-065 — Admin views a user's audit log from User Management
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to view the audit log for a specific user so that I can trace their actions and any admin actions taken against their account.
**Acceptance criteria:**
- Each user's detail panel has an "Audit Log" tab showing events in reverse chronological order
- Events include: login attempts (success/failure), session creation/expiry, role changes, and admin actions on the account
- Each log entry shows: timestamp, event type, actor (user or admin), and IP address
- The log is read-only; entries cannot be edited or deleted
- The audit log can be exported to CSV by Admin and Superadmin roles
- Log entries are retained for a minimum of 90 days (configurable)

---

### US-066 — Admin handles an empty user management state
**Role:** Admin
**Area:** User Management
**Story:** As an Admin on a freshly provisioned platform, I want to see a helpful empty state in User Management so that I understand how to begin onboarding users.
**Acceptance criteria:**
- When no non-admin users exist, the user list shows a centred empty state illustration and the text: "No users yet. Create your first user to get started."
- A "Create First User" button in the empty state opens the user creation form
- The empty state does not show for filtered searches (a no-results-found message is shown instead)
- The empty state is not shown to Admins who themselves appear in the list (at minimum one row is always visible)

---

## 15. Roles & Permissions

### US-067 — Superadmin views all roles and permissions
**Role:** Superadmin
**Area:** Roles & Permissions
**Story:** As a Superadmin, I want to see a matrix of all roles and their associated permissions so that I understand the full access model before making changes.
**Acceptance criteria:**
- The Roles & Permissions page shows a table with roles as columns and permissions as rows
- Each cell shows a checkmark or cross indicating whether the role has the permission
- The 12 platform permissions are all represented
- The table is read-only; permissions are system-defined and cannot be arbitrarily altered
- A legend explains each permission in plain language via a tooltip on each permission label
- The Superadmin is the only role that can view this page (Admin cannot)

---

### US-068 — Superadmin assigns a role to a user
**Role:** Superadmin
**Area:** Roles & Permissions
**Story:** As a Superadmin, I want to assign a new role to a user from the Roles & Permissions page so that I can elevate or change their access level.
**Acceptance criteria:**
- The Roles & Permissions page has a "Assign Role" action linked to the user list
- Selecting a user and a target role triggers a confirmation: "Assign [Role] to [User]? This will replace their current role."
- The role change takes effect immediately and invalidates the user's active session (forcing re-login)
- The user receives an email notification of their new role
- The assignment is logged in the audit trail with the Superadmin's identity
- A Superadmin cannot assign the Superadmin role to another user (that is a platform-level operation)

---

### US-069 — Superadmin revokes a role from a user
**Role:** Superadmin
**Area:** Roles & Permissions
**Story:** As a Superadmin, I want to revoke a user's elevated role and return them to the Player role so that I can downgrade access when needed.
**Acceptance criteria:**
- The revoke action is available from the user's role assignment record
- A confirmation dialog describes the permissions that will be lost
- On confirmation, the user's role is set to Player and their session is invalidated
- The user is notified by email of the role change
- Revocation is logged in the audit trail
- The Superadmin's own role cannot be revoked (the action is disabled for self)

---

### US-070 — Admin attempts to access Roles & Permissions and is blocked
**Role:** Admin
**Area:** Roles & Permissions
**Story:** As an Admin, I want to understand that the Roles & Permissions page is outside my access scope so that I do not inadvertently attempt to make role assignments.
**Acceptance criteria:**
- The Roles & Permissions navigation link is not visible to Admin users in the sidebar
- If an Admin navigates to the Roles & Permissions URL directly, they receive a 403 Forbidden page
- The 403 page explains: "This area requires Superadmin access" with a link back to the admin dashboard
- No partial data from the Roles & Permissions page is leaked in the 403 response
- The attempted access is logged in the audit trail as an unauthorised access attempt

---

### US-071 — Moderator attempts to access admin areas and is blocked
**Role:** Moderator
**Area:** Roles & Permissions
**Story:** As a Moderator, I want the system to prevent me from accessing admin-only areas so that permission boundaries are consistently enforced.
**Acceptance criteria:**
- Admin navigation items (User Management, Roles & Permissions, Stats & Analytics admin views) are not shown in the Moderator's sidebar
- Direct URL navigation to any admin page returns a 403 Forbidden response for Moderator sessions
- The Moderator's sidebar shows only: Lobby, Tables (with create/manage), and Hand Tagging
- Attempting any admin API action from a Moderator session returns HTTP 403 with a descriptive error body
- The Moderator sees no indication that admin pages exist (no broken links or empty sections)

---

### US-072 — Referee accesses only tournament-relevant admin functions
**Role:** Referee
**Area:** Roles & Permissions
**Story:** As a Referee, I want my navigation and permissions to be scoped to tournament management so that I cannot accidentally access or modify non-tournament data.
**Acceptance criteria:**
- The Referee sidebar shows: Lobby, Tournament Management, and Multi-Table view
- The Referee cannot access: User Management, Roles & Permissions, Player CRM, or Stable Management
- Attempting to access restricted URLs returns a 403 Forbidden page with the message: "This area requires Coach or Admin access"
- The Referee can view (but not modify) the blind schedule template library
- Referee actions are confined to the tournament lifecycle: start, eliminate, consolidate, end
- The Referee role badge is shown in the navigation bar to distinguish from other roles

---

## 16. Stats & Analytics

### US-073 — Player views the leaderboard
**Role:** Player, Coach, Admin, Superadmin
**Area:** Stats & Analytics
**Story:** As a Player, I want to see a leaderboard ranking all players by a configurable metric so that I understand my standing relative to peers.
**Acceptance criteria:**
- The leaderboard shows: rank, player name, avatar, selected metric value, and trend arrow (up/down from previous period)
- The default metric is net chip movement; alternative metrics include win rate, hands played, and tournament finishes
- A period selector allows filtering by: all time, last 30 days, last 7 days, and current session
- The authenticated player's own row is highlighted regardless of their rank position
- The leaderboard updates daily (or on demand for Admin roles)
- Players ranked outside the top 50 see their own row appended at the bottom with a separator

---

### US-074 — Coach views hand tag analytics for a student
**Role:** Coach
**Area:** Stats & Analytics
**Story:** As a Coach, I want to view an analytics breakdown of the tags applied to a student's hands so that I can identify recurring mistake patterns.
**Acceptance criteria:**
- The Stats & Analytics page has a "Hand Tags" view accessible to Coach and Admin roles
- Filtering by player name scopes the tag breakdown to that student
- A bar chart shows tag frequency (most common tags at top)
- Clicking a tag filters the hand history to show only hands with that tag
- The view supports date range filtering to show trends over time
- Exporting the tag breakdown to CSV is available for Coach and Admin

---

### US-075 — Coach views the mistake matrix for a student
**Role:** Coach
**Area:** Stats & Analytics
**Story:** As a Coach, I want to see a mistake matrix for a student that cross-references position and street with mistake frequency so that I can structure targeted coaching interventions.
**Acceptance criteria:**
- The mistake matrix is a grid of positions (UTG, MP, CO, BTN, SB, BB) versus streets (pre-flop, flop, turn, river)
- Each cell shows the count of hands tagged as mistakes in that position-street combination
- Cell colour intensity scales with mistake frequency (heat map style)
- Clicking a cell filters the hand history to those specific hands
- The matrix is accessible to Coach, Admin, and Superadmin roles; Players see only their own matrix
- An empty cell (no tagged mistakes) shows a dash rather than zero to reduce visual noise

---

### US-076 — Admin views platform-wide analytics
**Role:** Admin, Superadmin
**Area:** Stats & Analytics
**Story:** As an Admin, I want to view platform-wide statistics (total users, total hands, active sessions, table utilisation) so that I can monitor platform health and usage trends.
**Acceptance criteria:**
- A platform analytics dashboard is accessible from the Admin sidebar under Stats & Analytics
- Metrics displayed: total registered users, daily active users, total hands played (all time and today), active sessions count, and table utilisation percentage
- Each metric has a sparkline showing the 30-day trend
- The dashboard auto-refreshes every 60 seconds
- Data can be exported to CSV for the selected date range
- No individual player PII is exposed in the aggregate analytics view

---

### US-077 — Player views their own stats page
**Role:** Player
**Area:** Stats & Analytics
**Story:** As a Player, I want to navigate to my personal stats page so that I can review detailed performance metrics beyond the lobby stats row.
**Acceptance criteria:**
- The player's stats page is accessible from the lobby stats row and from the navigation menu
- Metrics shown: VPIP, PFR, aggression factor, win rate by position, showdown win rate, and net chip movement over time
- A hand history section with filters mirrors the CRM HISTORY tab but is self-service
- The player can filter by date range, table, and hand tags
- The page is scoped strictly to the authenticated player's own data; other players' data is not accessible
- Stats with insufficient sample size (fewer than 20 hands) show a "Not enough data" message

---

### US-078 — Player views stats with no hands played (empty state)
**Role:** Player
**Area:** Stats & Analytics
**Story:** As a new Player who has not yet played any hands, I want to see a clear empty state on my stats page so that I am guided toward playing rather than seeing confusing zeroes.
**Acceptance criteria:**
- When a player has zero hands in their history, all metric sections show an empty-state illustration with the text: "No data yet — join a table to start building your stats"
- The leaderboard does not show the player's row (or shows them at the bottom with an asterisk: "No hands played")
- The mistake matrix is entirely empty with a prompt to play hands
- The hand history list shows: "Your hand history is empty" with a "Find a Table" CTA button
- Once the first hand is completed, the empty states are replaced with real data without requiring a page refresh

---

## 17. Permission Boundary & Edge Case Stories

### US-079 — Player attempts to access the Coach Sidebar and is blocked
**Role:** Player
**Area:** Table view — player betting experience
**Story:** As a Player at a table, I want the Coach Sidebar to be completely hidden from my view so that I cannot interfere with coaching controls.
**Acceptance criteria:**
- The Coach Sidebar is not rendered in the DOM for Player, Trial, and Moderator roles at a table
- The sidebar toggle button (if any) is not visible or accessible to non-coach roles
- Any API endpoint for coach actions (deal, undo, adjust stack) returns HTTP 403 when called by a Player session
- No coaching information (e.g., scenario metadata, opponent hole cards pre-showdown) is leaked to the Player's UI
- The player's table view is focused entirely on their own betting controls and the visible table state

---

### US-080 — Moderator attempts to adjust player stacks and is blocked
**Role:** Moderator
**Area:** Coach Sidebar
**Story:** As a Moderator with table management access, I want the system to prevent me from adjusting player stacks so that financial integrity of sessions is maintained.
**Acceptance criteria:**
- The stack adjustment field is not rendered in the Moderator's sidebar player list
- If a Moderator constructs and sends a stack-adjustment API request manually, the server returns HTTP 403
- The Moderator's available actions per player are limited to: remove from table and view profile
- No error state is shown in the UI for the stack field (it is simply absent, not disabled)
- The restriction is documented in the help text visible to Moderators: "Stack adjustments require Coach access"

---

### US-081 — Trial user attempts to join a table and is blocked
**Role:** Trial
**Area:** Lobby
**Story:** As a Trial user, I want to receive a clear explanation when I click a locked table join button so that I understand what prevents me from participating.
**Acceptance criteria:**
- Clicking a locked join button shows a modal: "Joining tables requires a full Player account. Upgrade now to get started."
- The modal contains an "Upgrade" CTA and a "Maybe later" dismiss option
- The modal does not navigate away from the lobby
- The join action does not result in any server-side state change
- The table grid remains visible so the Trial user can continue browsing
- If a Trial user receives a direct URL to a table, they are redirected to the lobby with the upgrade modal shown

---

### US-082 — Coach opens a table for invited students only (private table walkthrough)
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach, I want to step through the full flow of creating a private coached table, inviting students, and beginning the session so that I can confidently run exclusive cohort sessions.
**Acceptance criteria:**
- The Coach creates a private table via Stable Management with mode "Coached Cash" and selects 3 invited students from the stable
- The table does not appear in the general lobby grid for non-invited users
- Invited students see the table with an "Invited" badge and can join with one click
- The Coach sees a roster panel showing which invited students have joined and which are pending
- The Coach cannot start dealing until at least one invited student has joined
- If an invited student declines or their invitation expires, the Coach can re-invite from the Stable Management roster without recreating the table

---

### US-083 — System handles a server error during a deal gracefully
**Role:** Player, Coach
**Area:** Table view — coached cash mode
**Story:** As a user at a table when a server error occurs during a deal, I want to see a clear error message and the game state to remain consistent so that the session can continue or be recovered.
**Acceptance criteria:**
- If the deal API call returns a 5xx error, the Coach sees an error toast: "Deal failed — please try again"
- The game state remains at the pre-deal state (no partial hands are shown to players)
- The Coach can retry the deal without any side effects
- Players see a "Waiting for deal…" state and are not shown an error (to avoid confusion)
- If the error persists for more than 30 seconds, a more prominent alert advises the Coach to end and restart the session
- The error is logged server-side with full context for debugging

---

### US-084 — Two coaches attempt to deal simultaneously (concurrency conflict)
**Role:** Coach
**Area:** Table view — coached cash mode
**Story:** As a Coach on a table that has a co-host, I want concurrent deal actions to be handled safely so that cards are not dealt twice.
**Acceptance criteria:**
- The server uses an optimistic lock on game state; only one deal action can succeed per hand
- The second coach to click Deal receives an error: "Another deal action is already in progress"
- The game state reflects only the first successful deal
- Both coaches' UIs sync to the true game state within 500ms of the conflict resolution
- The conflict event is logged for audit purposes
- A visual indicator shows which coach currently "holds the deal token" (if applicable to the UI)

---

### US-085 — Player rejoins a table after accidental page refresh
**Role:** Player
**Area:** Table view — player betting experience
**Story:** As a Player who accidentally refreshes the page while at a table, I want to be automatically returned to my seat with the current hand state restored so that I do not lose my position.
**Acceptance criteria:**
- On page load, the client checks for an active table session associated with the authenticated user
- If a session is found, the player is redirected to the table URL automatically
- The full current hand state (community cards, pot, current bet) is fetched and rendered within 2 seconds
- If the player's turn passed during the refresh, they are shown the action that was auto-applied and the current state
- If the hand completed during the refresh, the player sees the result summary before the next hand
- No duplicate seat entry is created; the player's seat record is updated (not duplicated)

---

## 18. Advanced Admin Flows

### US-086 — Admin reviews the platform audit log
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to view a platform-wide audit log so that I can investigate suspicious activity and verify that administrative actions were performed correctly.
**Acceptance criteria:**
- The audit log is accessible from the Admin sidebar as a standalone page
- Log entries include: timestamp, actor (user + role), action type, target entity (user/table/session), and IP address
- Filters allow narrowing by: actor, action type, date range, and target entity
- The log is read-only; no entries can be modified or deleted from the UI
- Entries are retained for a configurable period (default 90 days)
- Export to CSV is available for Admin and Superadmin roles
- The log loads efficiently with pagination for high-volume platforms

---

### US-087 — Admin configures platform-wide settings
**Role:** Admin, Superadmin
**Area:** User Management
**Story:** As an Admin, I want to configure global platform settings (session timeout, default blind levels, invitation expiry) so that the platform behaves according to the organisation's standards.
**Acceptance criteria:**
- A "Platform Settings" page is accessible from the Admin sidebar
- Configurable settings include: session timeout duration, default blind levels for new tables, invitation link expiry, turn timer default, and reconnection grace period
- Changes take effect for new sessions immediately; existing sessions use the settings at time of creation
- Each setting has a default value shown as a placeholder and a "Reset to default" option
- Saving settings requires Admin or Superadmin role; the save action is logged in the audit trail
- Invalid values (e.g., session timeout of 0 seconds) are rejected with inline validation errors

---

### US-088 — Superadmin views all coaches and their stables
**Role:** Superadmin
**Area:** User Management
**Story:** As a Superadmin, I want to view a list of all coaches and the size of their stables so that I can monitor platform utilisation and coach workloads.
**Acceptance criteria:**
- A "Coaches" filter or view in User Management shows only users with Coach role
- Each Coach row shows: name, stable size (number of assigned students), active sessions today, and last active date
- Clicking a Coach row shows their stable roster and links to their CRM entries
- The Superadmin can reassign a student from one Coach's stable to another from this view
- The view is accessible only to Superadmin; Admin sees coach accounts but without the stable size column

---

### US-089 — Superadmin promotes a student to Coach
**Role:** Superadmin
**Area:** Roles & Permissions
**Story:** As a Superadmin, I want to promote a Player to the Coach role so that they gain access to coaching tools and can begin managing a stable.
**Acceptance criteria:**
- From Roles & Permissions or User Management, the Superadmin selects a Player and changes their role to Coach
- A confirmation dialog: "Promote [Player Name] to Coach? They will gain access to: stable management, hand builder, playlists, CRM, and coaching controls."
- On confirmation, the user's role is updated, their active session is invalidated, and they must re-login
- Upon re-login, the new Coach sees the full Coach navigation and an onboarding prompt for stable setup
- The promotion is logged in the audit trail with the Superadmin's identity and timestamp
- The promoted Coach receives an email notification detailing their new capabilities

---

### US-090 — Superadmin promotes a student to Admin
**Role:** Superadmin
**Area:** Roles & Permissions
**Story:** As a Superadmin, I want to promote a user to the Admin role so that they can assist with platform management while I retain Superadmin authority.
**Acceptance criteria:**
- From Roles & Permissions, the Superadmin selects any non-Superadmin user and assigns the Admin role
- A high-friction confirmation dialog requires the Superadmin to type "CONFIRM ADMIN PROMOTION" before proceeding
- On confirmation, the user's role is set to Admin, all prior role-specific permissions are replaced with Admin permissions, and their session is invalidated
- The newly promoted Admin receives an email detailing the 11 permissions they now hold (all except Superadmin-scope actions)
- The promotion is recorded in the audit trail and is irreversible except by Superadmin role revocation
- The Superadmin sees the updated user row in User Management with the Admin badge immediately

---

## 19. Notifications & Communication

### US-091 — Player receives a notification when assigned a playlist
**Role:** Player
**Area:** Lobby
**Story:** As a Player, I want to receive an in-app notification when a Coach assigns a new playlist to me so that I can begin studying promptly.
**Acceptance criteria:**
- A bell icon in the navigation bar shows a badge with the count of unread notifications
- Clicking the bell opens a notification panel listing recent notifications in reverse chronological order
- The playlist assignment notification reads: "[Coach Name] assigned you the playlist: [Playlist Title]"
- Clicking the notification navigates to the playlist in the lobby playlists section
- The notification badge count decrements when the notification is marked as read
- Notifications persist across sessions until explicitly dismissed

---

### US-092 — Coach receives a notification when a student is eliminated from a tournament
**Role:** Coach
**Area:** Tournament Management
**Story:** As a Coach observing a tournament, I want to receive an in-app notification when one of my students is eliminated so that I can note it for coaching debrief.
**Acceptance criteria:**
- When a student from the Coach's stable is eliminated, a notification is pushed to the Coach: "[Student Name] was eliminated in position [N] at [Tournament Name]"
- The notification appears in the Coach's bell notification panel
- Clicking the notification navigates to the tournament's elimination log
- If the Coach is currently on the /multi page, the notification also appears as a top-of-screen banner
- The notification is generated for each elimination, not batched
- Coaches only receive notifications for their own stable members, not all players

---

### US-093 — Admin receives an alert when a user account is locked due to failed login attempts
**Role:** Admin, Superadmin
**Area:** Authentication & Session
**Story:** As an Admin, I want to be alerted when a user account is automatically locked after repeated failed login attempts so that I can investigate potential security incidents.
**Acceptance criteria:**
- After a configurable number of consecutive failed login attempts (default: 5), the account is temporarily locked for a configurable duration (default: 15 minutes)
- The locked user sees: "Your account has been temporarily locked due to multiple failed login attempts. Try again in 15 minutes."
- An Admin notification is generated: "Account [username] has been locked after [N] failed attempts. IP: [x.x.x.x]"
- Admins can manually unlock the account from User Management before the lockout expires
- The lockout event is recorded in the audit trail and the user's audit log
- Persistent lockouts (e.g., 3 lockout events within 24 hours) escalate to a Superadmin notification

---

## 20. Onboarding & Help

### US-094 — New player completes onboarding tour
**Role:** Player
**Area:** Lobby
**Story:** As a new Player logging in for the first time, I want to be guided through an onboarding tour of the lobby so that I understand the platform's layout and key features.
**Acceptance criteria:**
- The onboarding tour triggers automatically on first login (based on a "tour_completed" flag in the user record)
- The tour uses a step-by-step tooltip overlay highlighting: the stats row, the table grid, the recent hands section, and the playlists section
- Each step has a "Next", "Back", and "Skip tour" option
- Skipping or completing the tour sets the "tour_completed" flag and does not show again on subsequent logins
- The tour can be re-triggered from a "Help" or "?" menu
- The tour does not interfere with real-time data (no fake data is injected; empty states are shown naturally)

---

### US-095 — Coach accesses contextual help for the Hand Builder
**Role:** Coach
**Area:** Hand Builder & Scenarios
**Story:** As a Coach using the Hand Builder for the first time, I want to access contextual help documentation so that I can learn the tool without leaving the platform.
**Acceptance criteria:**
- A "?" or "Help" icon is visible within the Hand Builder interface
- Clicking it opens a contextual help panel or modal with step-by-step guidance for the current section
- The help content covers: setting up players, assigning cards, scripting actions, and saving to the library
- Help content is searchable within the panel
- An "Open full documentation" link opens the full help site in a new tab
- The help panel does not obstruct the builder interface (it is a side panel or collapsible drawer)

---

## 21. Session Assignment & Tracking

### US-096 — Coach creates a named training session and assigns it to multiple students
**Role:** Coach
**Area:** Stable Management
**Story:** As a Coach, I want to create a named training session template and assign it to a group of students at once so that a cohort's training plan is set up efficiently.
**Acceptance criteria:**
- From Stable Management, the Coach can create a session template with: session name, goals (freetext), associated playlists, and scheduled date/time
- The Coach selects multiple students from the stable roster and assigns the session to all of them in one action
- Each selected student receives a notification: "You have been enrolled in the session: [Session Name] on [Date]"
- The session appears in each student's CRM SCHEDULE tab and in the Coach's session overview
- The Coach can adjust assignments (add or remove students) up until the session start time
- When the session starts, all assigned students who are online receive a reminder notification

---

## 22. Platform Integrity & Accessibility

### US-097 — Platform enforces HTTPS and rejects insecure connections
**Role:** All
**Area:** Authentication & Session
**Story:** As any user, I want the platform to enforce secure connections so that my credentials and game data are protected in transit.
**Acceptance criteria:**
- All HTTP requests are redirected to HTTPS with a 301 status code
- WebSocket connections use WSS (WebSocket Secure) exclusively
- The HSTS header is set with a max-age of at least 31536000 seconds
- Mixed-content warnings are absent from all pages
- TLS certificate validity is monitored; an expiry within 30 days triggers an Admin alert
- The login form does not submit over plain HTTP even if the user manually types an HTTP URL

---

### US-098 — Platform is accessible to keyboard-only users
**Role:** All
**Area:** Lobby, Table view — player betting experience
**Story:** As a user who navigates using only a keyboard, I want all interactive elements to be reachable and operable via keyboard so that the platform is usable without a mouse.
**Acceptance criteria:**
- All interactive elements (buttons, inputs, dropdowns, table cards) are reachable via Tab and Shift+Tab in logical order
- The currently focused element has a visible focus indicator (outline or highlight)
- Modal dialogs trap focus within the modal while open and return focus to the trigger element on close
- Dropdowns and custom selects are operable with arrow keys and Enter/Escape
- The table view betting controls (Fold, Check/Call, Bet/Raise) are fully keyboard operable during a player's turn
- Automated accessibility checks (e.g., axe-core) pass with zero critical violations on lobby and table pages

---

### US-099 — Platform handles a database outage gracefully
**Role:** All
**Area:** Authentication & Session
**Story:** As any user during a database outage, I want the platform to display a clear service degradation message so that I understand the issue is on the platform side and not my connection.
**Acceptance criteria:**
- When the database is unreachable, the API returns a 503 Service Unavailable response
- The client detects 503 responses and shows a full-page maintenance banner: "Poker Trainer is temporarily unavailable. We're working on it. Please try again shortly."
- The banner auto-retries the health check endpoint every 30 seconds and dismisses automatically when service is restored
- Authenticated sessions that were active during the outage are not invalidated; users can resume without re-login when service returns
- The maintenance banner is accessible and does not require JavaScript to render (server-side rendered fallback)
- Admins receive an automated alert via email when a 503 condition persists for more than 2 minutes

---

### US-100 — Superadmin promotes a student to Admin (final story)
**Role:** Superadmin
**Area:** Roles & Permissions
**Story:** As a Superadmin, I want to promote a trusted long-standing Player directly to the Admin role so that they can fully assist in managing the platform alongside me.
**Acceptance criteria:**
- The Superadmin navigates to Roles & Permissions and locates the target user (current role: Player)
- The role assignment panel shows all assignable roles; "Admin" is available to Superadmin only
- Selecting Admin and clicking "Assign" presents a high-friction confirmation dialog requiring the Superadmin to confirm with their own password, not just a typed phrase
- On successful authentication, the role change is applied instantly: the target user's session is terminated and their account is upgraded to Admin
- The newly promoted Admin receives both an in-app notification (visible on next login) and an email listing all 11 Admin-scope permissions now granted to them
- The promotion event is permanently recorded in the platform audit log: actor (Superadmin), target (user), previous role (Player), new role (Admin), timestamp, and IP address
- The Superadmin's dashboard shows the updated user count breakdown (e.g., "Admins: 2")
- The promoted user's first login as Admin triggers an Admin-specific onboarding prompt explaining their new responsibilities and pointing to platform settings documentation

---

*End of user story document — 100 stories, US-001 through US-100.*

---

## Appendix: Story Index by Role

| Role | Story Numbers |
|---|---|
| Player | US-001, US-004, US-008–010, US-013–016, US-022, US-045, US-077–079, US-081, US-085, US-091, US-094, US-097–099 |
| Trial | US-002, US-007, US-081, US-097–099 |
| Moderator | US-012, US-032, US-041, US-071, US-080, US-097–099 |
| Referee | US-024–027, US-053–055, US-059, US-072, US-097–099 |
| Coach | US-017–023, US-028–031, US-033–036, US-039–040, US-043–044, US-046–050, US-052, US-056, US-058, US-074–075, US-082, US-084, US-089, US-092, US-095–096 |
| Admin | US-005, US-051, US-057, US-060–066, US-070, US-076, US-086–088, US-093 |
| Superadmin | US-067–069, US-088–090, US-099–100 |

## Appendix: Story Index by Area

| Area | Story Numbers |
|---|---|
| Authentication & Session | US-001–005, US-093, US-097, US-099 |
| Lobby | US-006–012, US-038, US-078, US-081, US-091, US-094 |
| Table — Player Betting | US-013–016, US-079, US-085 |
| Table — Coached Cash | US-017–021, US-083–084 |
| Table — Auto Cash | US-022–023 |
| Table — Tournament | US-024–028 |
| Coach Sidebar | US-029–032, US-080 |
| Stable Management | US-033–038, US-082, US-096 |
| Hand Builder & Scenarios | US-039–042, US-095 |
| Playlists | US-043–046 |
| Player CRM | US-047–051 |
| Tournament Management | US-052–056 |
| Multi-Table View | US-057–059 |
| User Management | US-060–066, US-086–088 |
| Roles & Permissions | US-067–072, US-089–090, US-100 |
| Stats & Analytics | US-073–078 |