const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, pingInterval: 25000, pingTimeout: 20000 });
const PORT = process.env.PORT || 3000;
const WIDTH = 1000, HEIGHT = 650, SPEED = 230, PLAYER_RADIUS = 17, MAX_PLAYERS = 16;
const KILL_LIMIT = 5;
const rooms = new Map();
let nextPlayerNumber = 1; // server-wide counter: every player who joins gets a unique ID
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid mix-ups when sharing codes
const WEAPONS = {
  pulse: { label: 'Pulse Rifle', speed: 560, damage: 20, cooldown: 180, color: '#8af4ff', spread: 0.025 },
  blaster: { label: 'Blaster', speed: 440, damage: 35, cooldown: 430, color: '#ff7cdb', spread: 0.01 },
  rapid: { label: 'Rapid Fire', speed: 620, damage: 10, cooldown: 90, color: '#ffd166', spread: 0.075 }
};
const SKINS = { cyan: '#54f1d1', violet: '#ad8cff', coral: '#ff718d', gold: '#ffd166', blue: '#62a8ff', lime: '#a3f76b' };
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0) }));
function cleanRoomCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
function generateRoomCode() {
  let code;
  do { code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(code)); // never reuse a live room's code
  return code;
}
function createRoom(code) { const room = { players: new Map(), bullets: [], nextBulletId: 1 }; rooms.set(code, room); return room; }
function newPlayerId() { return '#' + String(nextPlayerNumber++).padStart(4, '0'); }
function spawnPlayer(socket, room, code, data = {}) {
  const skin = SKINS[data.skin] ? data.skin : 'cyan';
  const weapon = WEAPONS[data.weapon] ? data.weapon : 'pulse';
  const player = { id: socket.id, pid: newPlayerId(), name: String(data.name || 'Player').trim().slice(0, 16) || 'Player', x: 60 + Math.random() * (WIDTH - 120), y: 60 + Math.random() * (HEIGHT - 120), angle: 0, skin, color: SKINS[skin], weapon, hp: 100, kills: 0, deaths: 0, input: { up: false, down: false, left: false, right: false }, aim: { x: 1, y: 0 }, firing: false, lastShot: 0, respawnAt: 0 };
  room.players.set(socket.id, player); socket.join(code); socket.data.roomCode = code;
  socket.emit('joined', { id: socket.id, playerId: player.pid, code, width: WIDTH, height: HEIGHT, maxPlayers: MAX_PLAYERS, killLimit: KILL_LIMIT });
  io.to(code).emit('notice', `${player.name} (${player.pid}) joined the arena.`);
}
io.on('connection', (socket) => {
  socket.on('joinRoom', (data = {}) => {
    if (socket.data.roomCode) return;
    if (!String(data.name || '').trim()) { socket.emit('joinError', 'Enter a username first.'); return; }
    let code, room;
    if (data.mode === 'create') {
      code = generateRoomCode(); room = createRoom(code); // the server picks the code; the player never has to invent one
    } else {
      code = cleanRoomCode(data.code);
      if (!code) { socket.emit('joinError', 'Enter a room code to join, or create a new room.'); return; }
      room = rooms.get(code);
      if (!room) { socket.emit('joinError', `Room ${code} was not found. Check the code or create a new room.`); return; }
      if (room.players.size >= MAX_PLAYERS) { socket.emit('joinError', `This room is full (maximum ${MAX_PLAYERS} players).`); return; }
    }
    spawnPlayer(socket, room, code, data);
  });
  socket.on('leaveRoom', () => removePlayer(socket));
  socket.on('input', (data = {}) => {
    const code = socket.data.roomCode; if (!code) return;
    const p = rooms.get(code)?.players.get(socket.id); if (!p || p.hp <= 0) return;
    const keys = data.keys || {};
    p.input = { up: !!keys.up, down: !!keys.down, left: !!keys.left, right: !!keys.right };
    if (Number.isFinite(data.aimX) && Number.isFinite(data.aimY)) { const len = Math.hypot(data.aimX, data.aimY) || 1; p.aim = { x: data.aimX / len, y: data.aimY / len }; p.angle = Math.atan2(p.aim.y, p.aim.x); }
    p.firing = !!data.firing;
  });
  socket.on('disconnect', () => removePlayer(socket));
});
function removePlayer(socket) {
  const code = socket.data.roomCode; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  const p = room.players.get(socket.id); if (p) io.to(code).emit('notice', `${p.name} left the arena.`);
  room.players.delete(socket.id); room.bullets = room.bullets.filter((b) => b.ownerId !== socket.id); socket.leave(code); if (!room.players.size) rooms.delete(code); socket.data.roomCode = null;
}
// First player to KILL_LIMIT wins: the match ends for everyone in the room and each player gets the final standings.
function endMatch(code, room, finishers) {
  const byRank = (x, y) => y.kills - x.kills || x.deaths - y.deaths;
  const snap = (p) => ({ id: p.id, pid: p.pid, name: p.name, color: p.color, skin: p.skin, weapon: p.weapon, kills: p.kills, deaths: p.deaths });
  const winnerPlayer = [...finishers].sort(byRank)[0]; // if two players hit the limit in the same tick: more kills, then fewer deaths
  const winner = snap(winnerPlayer);
  const standings = [winner, ...[...room.players.values()].filter((p) => p.id !== winnerPlayer.id).map(snap).sort(byRank)];
  io.to(code).emit('matchOver', { code, killLimit: KILL_LIMIT, winner, standings });
  for (const p of room.players.values()) { const sock = io.sockets.sockets.get(p.id); if (sock) { sock.leave(code); sock.data.roomCode = null; } } // everyone is back in the lobby
  room.players.clear(); room.bullets = []; rooms.delete(code);
}
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min((now - lastTick) / 1000, 0.05); lastTick = now;
  for (const [code, room] of rooms) {
    const players = [...room.players.values()];
    for (const p of players) {
      if (p.hp <= 0) { if (now >= p.respawnAt) { p.hp = 100; p.x = 60 + Math.random() * (WIDTH - 120); p.y = 60 + Math.random() * (HEIGHT - 120); io.to(p.id).emit('respawn'); } continue; }
      let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0), dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0), len = Math.hypot(dx, dy) || 1;
      if (dx || dy) { dx /= len; dy /= len; }
      p.x = Math.max(PLAYER_RADIUS, Math.min(WIDTH - PLAYER_RADIUS, p.x + dx * SPEED * dt)); p.y = Math.max(PLAYER_RADIUS, Math.min(HEIGHT - PLAYER_RADIUS, p.y + dy * SPEED * dt));
      const w = WEAPONS[p.weapon] || WEAPONS.pulse;
      if (p.firing && now - p.lastShot >= w.cooldown) {
        p.lastShot = now; const spread = (Math.random() - .5) * w.spread;
        const angle = p.angle + spread;
        room.bullets.push({ id: room.nextBulletId++, ownerId: p.id, x: p.x + Math.cos(angle) * (PLAYER_RADIUS + 7), y: p.y + Math.sin(angle) * (PLAYER_RADIUS + 7), vx: Math.cos(angle) * w.speed, vy: Math.sin(angle) * w.speed, born: now, color: w.color, damage: w.damage });
        socketEmitEffect(code, 'shoot', { x: p.x, y: p.y, color: w.color, playerId: p.id });
      }
    }
    const finishers = new Set(); // players who hit the kill limit this tick
    room.bullets = room.bullets.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (now - b.born > 1500 || b.x < 0 || b.y < 0 || b.x > WIDTH || b.y > HEIGHT) return false;
      for (const target of players) {
        if (target.id === b.ownerId || target.hp <= 0) continue;
        if (Math.hypot(target.x - b.x, target.y - b.y) < PLAYER_RADIUS + 5) {
          target.hp = Math.max(0, target.hp - b.damage); io.to(code).emit('effect', { type: 'hit', x: b.x, y: b.y, color: b.color, angle: Math.atan2(b.vy, b.vx), targetId: target.id });
          if (target.hp === 0) { target.deaths++; const shooter = room.players.get(b.ownerId); if (shooter) { shooter.kills++; if (shooter.kills >= KILL_LIMIT) finishers.add(shooter); } target.respawnAt = now + 1800; io.to(code).emit('notice', `${shooter ? shooter.name : 'A player'} eliminated ${target.name}!`); io.to(code).emit('effect', { type: 'kill', x: target.x, y: target.y, color: target.color, angle: Math.atan2(b.vy, b.vx), targetId: target.id }); }
          return false;
        }
      }
      return true;
    });
    if (finishers.size) { endMatch(code, room, finishers); continue; }
    if (!room.players.size) { rooms.delete(code); continue; }
    const live = [...room.players.values()];
    io.to(code).emit('state', { players: live.map(p => ({ id: p.id, pid: p.pid, name: p.name, x: p.x, y: p.y, angle: p.angle, color: p.color, skin: p.skin, weapon: p.weapon, hp: p.hp, kills: p.kills, deaths: p.deaths })), bullets: room.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, color: b.color })) });
  }
}, 1000 / 30);
function socketEmitEffect(code, type, data) { io.to(code).emit('effect', { type, ...data }); }
server.listen(PORT, '0.0.0.0', () => console.log(`Arena Online is running at http://localhost:${PORT}`));
