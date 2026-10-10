# Neon Arena — Online Multiplayer Shooter

A browser-based 2D multiplayer arena shooter built with Node.js, Express, Socket.IO, HTML, CSS and Canvas.

## Features
- Home page: enter a username, then **Create New Room** or **Join Room** with a friend's code.
- Room codes: generated automatically by the server (5 characters, no look-alike characters like 0/O or 1/I) and never reused while a room is live. Joining a code that doesn't exist shows an error instead of silently creating a room.
- Unique player IDs: the server assigns every player an ID (e.g. `#0007`), shown in the match bar and on the scoreboard.
- Five-kill limit: the first player to reach 5 kills wins and the match ends for everyone in the room. Every player is taken to a separate **Match Over** page showing the winner and the final kill scoreboard (rank, name, ID, kills, deaths), with a **Back to Lobby** button.
- Live scoreboard (during the match): player names, IDs, kills (out of 5) and deaths, sorted by kills, updated 30 times per second.
- Up to 16 players per room.
- WASD / arrow movement, mouse aim, hold click to shoot.
- Mobile movement joystick and FIRE button; touch automatically aims at the nearest opponent.
- Human characters (top-down, holding a gun) with six selectable outfit colors; skin tone and hair vary per player.
- Three weapons: Pulse Rifle (balanced), Heavy Blaster (high damage), Rapid Fire (fast firing).
- Server-authoritative movement, hits, health, kills, deaths and respawns.
- Clean, plain arena floor.
- Health bars, scoreboard and blood effects: a directional blood spray when a player is hit, a bigger burst on a kill, stains that fade from the floor after ~20 seconds, and a red screen flash when you are hit.
- Synthesized sound effects and low-volume generated background tones; no audio files required.
- `/health` endpoint for simple deployment checks.

## Run locally on Windows
1. Install Node.js LTS (20 or newer) from https://nodejs.org/.
2. Extract the project folder and open it in VS Code.
3. In VS Code, select Terminal → New Terminal.
4. Run `npm.cmd install` (works in PowerShell even when script execution blocks `npm.ps1`).
5. Run `npm.cmd start`.
6. Open http://localhost:3000 in Chrome.
7. Enter a username, choose an outfit color and weapon, then click **Create New Room**. Share the displayed room code with other players.
8. For a local test, open a second browser window, enter another username, type the code into **Room Code** and click **Join Room**.

Keep the terminal open while playing. Stop with Ctrl+C.

## Controls
- Desktop: WASD / arrow keys to move; mouse to aim; hold left mouse button to fire.
- Mobile: left joystick to move; FIRE button to shoot. The game automatically aims at the nearest opponent on touch devices.

## Test on another device on the same Wi-Fi
1. Run `ipconfig` on the host PC and find its private IPv4 address.
2. On the other device, visit `http://YOUR-PC-IP:3000` and join with the same room code.
3. If Windows Firewall prompts, allow Node.js on private networks only. Do not port-forward the development server to the public internet.

## Deploy so friends can play from anywhere
1. Create a private repository on GitHub and upload the contents of this project folder.
2. On a hosting provider that supports Node.js services and WebSockets (for example Render), create a Web Service connected to the repository.
3. Set Build Command to `npm install` and Start Command to `npm start`.
4. The app reads the provider's `PORT` environment variable automatically.
5. Deploy, open the HTTPS URL provided by the host, and share it plus your room code with friends.
6. Check current host pricing, free-tier sleep behavior, limits, and WebSocket support before choosing a plan.

## Important notes
- Room codes are invitations, not passwords; anyone with the code can join.
- The kill limit is a constant (`KILL_LIMIT`) near the top of `server.js` if you want to change it.
- This is a learning project, not production-hardened competitive infrastructure. Before public release, add input rate limits, server-side validation, anti-cheat controls, moderation/reporting, privacy safeguards and load testing.
- Current arena geometry is visual only; no physical obstacle collision is implemented.
