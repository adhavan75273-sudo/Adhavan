(() => {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const joinPanel = $('joinPanel'), gamePanel = $('gamePanel'), canvas = $('game'), ctx = canvas.getContext('2d');
  const keys = { up: false, down: false, left: false, right: false };
  let joined = false, myId = null, myPid = '', killLimit = 5, maxPlayers = 16, roomCode = '', world = { players: [], bullets: [] }, mouse = { x: 700, y: 325 }, firing = false, toastTimer, soundOn = true, audioCtx = null, musicTimer = null;
  const particles = [], stains = []; let hitFlash = 0;
  const resultsPanel = $('resultsPanel');
  const weaponNames = { pulse: 'PULSE RIFLE', blaster: 'HEAVY BLASTER', rapid: 'RAPID FIRE' };
  socket.on('connect', () => { $('connectionText').textContent = 'SERVER CONNECTED'; $('connection').classList.add('online'); $('connectionDot').style.background = '#54f1d1'; });
  socket.on('disconnect', () => { $('connectionText').textContent = 'DISCONNECTED'; $('connection').classList.remove('online'); if (joined) returnToLobby('<b>Connection lost.</b> You were disconnected from the match. Create a new room or join one again.'); });
  socket.on('joinError', message => { $('joinError').textContent = message; });
  socket.on('joined', data => { joined = true; myId = data.id; myPid = data.playerId; killLimit = data.killLimit || 5; maxPlayers = data.maxPlayers || 16; roomCode = data.code; $('roomLabel').textContent = roomCode; $('myIdLabel').textContent = myPid; $('lobbyNotice').classList.add('hidden'); $('joinError').textContent = ''; joinPanel.classList.add('hidden'); gamePanel.classList.remove('hidden'); showToast(`Joined ${roomCode} as ${myPid}. Share the room code with friends!`); });
  socket.on('state', state => { if (!joined) return; world = state; $('matchPlayers').textContent = `${state.players.length}/${maxPlayers}`; updateScoreboard(); });
  socket.on('matchOver', data => showResults(data));
  socket.on('notice', showToast);
  socket.on('effect', effect => {
    if (effect.type === 'shoot') { if (effect.playerId === myId) sound('shoot'); addParticles(effect.x, effect.y, '#f59e0b', 4, 2.2); }
    else if (effect.type === 'hit') { sound('hit'); addBlood(effect.x, effect.y, effect.angle, 16, 5, false); if (effect.targetId === myId) hitFlash = 1; }
    else if (effect.type === 'kill') { sound('kill'); addBlood(effect.x, effect.y, effect.angle, 42, 7, true); addStain(effect.x, effect.y, 20); if (effect.targetId === myId) hitFlash = 1; }
  });
  function enterRoom(mode) {
    const name = $('playerName').value.trim(), code = $('roomCode').value.trim();
    if (!socket.connected) { $('joinError').textContent = 'Not connected yet. Wait a moment and try again.'; return; }
    if (!name) { $('joinError').textContent = 'Enter a username first.'; $('playerName').focus(); return; }
    if (mode === 'join' && !code) { $('joinError').textContent = 'Enter a room code to join, or create a new room.'; $('roomCode').focus(); return; }
    $('joinError').textContent = ''; startAudio();
    socket.emit('joinRoom', { mode, name, code, skin: document.querySelector('input[name="skin"]:checked').value, weapon: $('weaponChoice').value });
  }
  $('createRoomBtn').addEventListener('click', () => enterRoom('create'));
  $('joinRoomBtn').addEventListener('click', () => enterRoom('join'));
  $('joinForm').addEventListener('submit', event => { event.preventDefault(); enterRoom($('roomCode').value.trim() ? 'join' : 'create'); }); // Enter key
  function leaveMatchView() {
    joined = false; world = { players: [], bullets: [] }; particles.length = 0; stains.length = 0; hitFlash = 0; firing = false; Object.keys(keys).forEach(k => keys[k] = false); stopMusic();
    gamePanel.classList.add('hidden'); $('scoreboard').innerHTML = ''; $('joinError').textContent = '';
  }
  function returnToLobby(messageHtml) {
    leaveMatchView(); myId = null; resultsPanel.classList.add('hidden'); joinPanel.classList.remove('hidden');
    const notice = $('lobbyNotice'); if (messageHtml) { notice.innerHTML = messageHtml; notice.classList.remove('hidden'); } else notice.classList.add('hidden');
  }
  // Separate results page, shown to every player in the room when someone reaches the kill limit.
  function showResults(d) {
    const rank = d.standings.findIndex(p => p.id === myId), won = d.winner.id === myId;
    leaveMatchView(); joinPanel.classList.add('hidden'); resultsPanel.classList.remove('hidden'); window.scrollTo(0, 0);
    $('resultsRoom').textContent = d.code; $('winnerName').textContent = d.winner.name;
    $('winnerMeta').textContent = `${d.winner.pid} · ${d.winner.kills} KILLS · ${d.winner.deaths} DEATH${d.winner.deaths === 1 ? '' : 'S'}`;
    const mine = $('yourResult'); mine.classList.toggle('won', won);
    mine.textContent = won ? 'YOU WON THE MATCH!' : rank >= 0 ? `You finished #${rank + 1} with ${d.standings[rank].kills} kill${d.standings[rank].kills === 1 ? '' : 's'}.` : '';
    $('resultsCount').textContent = `${d.standings.length} PLAYER${d.standings.length === 1 ? '' : 'S'}`;
    const body = $('resultsBody'); body.innerHTML = '';
    d.standings.forEach((p, i) => {
      const tr = document.createElement('tr'); if (p.id === d.winner.id) tr.className = 'winner'; if (p.id === myId) tr.classList.add('me');
      const cells = [String(i + 1), null, p.pid, String(p.kills), String(p.deaths)];
      cells.forEach((text, c) => { const td = document.createElement('td'); if (c === 1) { const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color; td.append(dot, document.createTextNode(p.name + (p.id === myId ? ' (YOU)' : '') + (p.id === d.winner.id ? ' 🏆' : ''))); } else td.textContent = text; tr.appendChild(td); });
      body.appendChild(tr);
    });
    if (won) sound('win');
  }
  $('backToLobby').addEventListener('click', () => returnToLobby(''));
  $('copyRoom').addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomCode); showToast('Room code copied: ' + roomCode); } catch { showToast('Share this room code: ' + roomCode); } });
  $('leaveButton').addEventListener('click', () => { socket.emit('leaveRoom'); returnToLobby(''); });
  $('soundButton').addEventListener('click', () => { soundOn = !soundOn; $('soundButton').textContent = soundOn ? '♫ SOUND ON' : '♫ SOUND OFF'; $('soundButton').classList.toggle('sound-muted', !soundOn); if (soundOn) startAudio(); else stopMusic(); });
  function setKey(key, value) { if (['w','arrowup'].includes(key)) keys.up = value; if (['s','arrowdown'].includes(key)) keys.down = value; if (['a','arrowleft'].includes(key)) keys.left = value; if (['d','arrowright'].includes(key)) keys.right = value; }
  window.addEventListener('keydown', event => { const key = event.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault(); setKey(key, true); if (key === ' ') firing = true; });
  window.addEventListener('keyup', event => { setKey(event.key.toLowerCase(), false); if (event.key === ' ') firing = false; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach(k => keys[k] = false); firing = false; });
  function pointerToCanvas(event) { const r = canvas.getBoundingClientRect(); mouse.x = (event.clientX - r.left) * canvas.width / r.width; mouse.y = (event.clientY - r.top) * canvas.height / r.height; }
  canvas.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') pointerToCanvas(event); });
  canvas.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' && event.button === 0) { pointerToCanvas(event); firing = true; startAudio(); } });
  window.addEventListener('pointerup', event => { if (event.pointerType === 'mouse') firing = false; }); canvas.addEventListener('contextmenu', event => event.preventDefault());
  // Touch movement pad: drag from the pad centre to move in four directions.
  const joystick = $('joystick'), stick = $('stick'); let joyPointer = null;
  function moveStick(event) { const r = joystick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = event.clientX - cx, dy = event.clientY - cy; const max = r.width * .34, length = Math.hypot(dx, dy) || 1; if (length > max) { dx = dx / length * max; dy = dy / length * max; } stick.style.transform = `translate(${dx}px,${dy}px)`; keys.left = dx < -12; keys.right = dx > 12; keys.up = dy < -12; keys.down = dy > 12; }
  joystick.addEventListener('pointerdown', event => { joyPointer = event.pointerId; joystick.setPointerCapture(joyPointer); moveStick(event); }); joystick.addEventListener('pointermove', event => { if (event.pointerId === joyPointer) moveStick(event); });
  function resetStick() { joyPointer = null; stick.style.transform = ''; Object.keys(keys).forEach(k => keys[k] = false); }
  joystick.addEventListener('pointerup', resetStick); joystick.addEventListener('pointercancel', resetStick);
  const touchFire = $('touchFire'); touchFire.addEventListener('pointerdown', event => { event.preventDefault(); firing = true; startAudio(); touchFire.setPointerCapture(event.pointerId); }); touchFire.addEventListener('pointerup', () => firing = false); touchFire.addEventListener('pointercancel', () => firing = false); touchFire.addEventListener('lostpointercapture', () => firing = false);
  setInterval(() => {
    if (!joined) return;
    const me = world.players.find(p => p.id === myId);
    // Touch devices aim at the nearest opponent automatically; desktop aims at the mouse.
    let dx = me ? mouse.x - me.x : 1, dy = me ? mouse.y - me.y : 0;
    if (window.matchMedia('(pointer: coarse)').matches && me) { const target = world.players.filter(p => p.id !== myId && p.hp > 0).sort((a,b) => Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]; if (target) { dx = target.x - me.x; dy = target.y - me.y; } }
    socket.emit('input', { keys, aimX: dx, aimY: dy, firing });
  }, 1000 / 30);
  // ---- Clean, plain arena floor (no neon lanes) so characters and blood read clearly.
  function drawArena() {
    ctx.fillStyle = '#e6e9ee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d3d8e0'; ctx.lineWidth = 1;
    for (let x = 100; x < canvas.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 100; y < canvas.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.strokeStyle = '#2f3b4f'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  }
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, v)); return `rgb(${c((n >> 16) + amt)},${c(((n >> 8) & 255) + amt)},${c((n & 255) + amt)})`; }
  const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'], HAIR_TONES = ['#2b1d12', '#4a2c17', '#111111', '#8a5a2b', '#c9a14a'];
  // ---- Top-down human: shoulders in the outfit colour, head with hair, arms holding a gun, feet that step as you move.
  function drawPlayer(p, time) {
    const dead = p.hp <= 0, me = p.id === myId, n = parseInt(String(p.pid || '#0').slice(1), 10) || 0, skin = SKIN_TONES[n % SKIN_TONES.length], hair = HAIR_TONES[(n * 3 + 1) % HAIR_TONES.length];
    const step = Math.sin((p.x + p.y) / 9) * 4;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.globalAlpha = dead ? .4 : 1;
    ctx.fillStyle = 'rgba(15,23,42,.16)'; ctx.beginPath(); ctx.ellipse(1, 3, 18, 15, 0, 0, Math.PI * 2); ctx.fill();            // ground shadow
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.ellipse(-7 + step, -7, 6, 3.6, 0, 0, Math.PI * 2); ctx.ellipse(-7 - step, 7, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill(); // shoes
    ctx.strokeStyle = shade(p.color, -30); ctx.lineWidth = 6; ctx.lineCap = 'round';                                            // arms
    ctx.beginPath(); ctx.moveTo(-1, -11); ctx.lineTo(15, -3.5); ctx.moveTo(-1, 11); ctx.lineTo(15, 3.5); ctx.stroke();
    ctx.fillStyle = '#2b3240'; ctx.beginPath(); ctx.roundRect(9, -3, 25, 6, 2); ctx.fill(); ctx.fillStyle = '#566174'; ctx.fillRect(9, -3, 9, 6); // gun
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(15, -3.5, 3.2, 0, Math.PI * 2); ctx.arc(15, 3.5, 3.2, 0, Math.PI * 2); ctx.fill(); // hands
    ctx.fillStyle = p.color; ctx.strokeStyle = shade(p.color, -55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(-2, 0, 9.5, 16.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // torso
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(1, 0, 9, 0, Math.PI * 2); ctx.fill();                                       // hair
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(3, 0, 7.3, 0, Math.PI * 2); ctx.fill();                                      // face
    if (me) { ctx.globalAlpha = dead ? .3 : .9; ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 24 + Math.sin(time / 180) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.font = me ? '700 12px Inter,sans-serif' : '600 11px Inter,sans-serif'; ctx.lineJoin = 'round';
    const label = p.name + (me ? ' · YOU' : ''); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeText(label, p.x, p.y - 31); ctx.fillStyle = '#111827'; ctx.fillText(label, p.x, p.y - 31);
    if (dead) { ctx.font = '700 10px "DM Mono",monospace'; ctx.fillStyle = '#b42318'; ctx.fillText('RESPAWNING', p.x, p.y + 36); }
    else { ctx.fillStyle = '#b8c0cc'; ctx.fillRect(p.x - 20, p.y + 26, 40, 5); ctx.fillStyle = p.hp > 55 ? '#16a34a' : p.hp > 25 ? '#f59e0b' : '#dc2626'; ctx.fillRect(p.x - 20, p.y + 26, 40 * p.hp / 100, 5); }
  }
  // ---- Blood: a directional spray when hit, a big burst on a kill, and stains that stay on the floor then fade.
  const BLOOD = ['#b91c1c', '#dc2626', '#991b1b', '#7f1d1d'], STAIN_LIFE = 20000;
  function addStain(x, y, size) {
    const blobs = [{ dx: 0, dy: 0, r: size }], extra = 3 + Math.floor(size / 4);
    for (let i = 0; i < extra; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * size * 1.4; blobs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: Math.random() * size * .35 + 1 }); }
    stains.push({ x, y, blobs, born: performance.now() }); if (stains.length > 220) stains.shift();
  }
  function addBlood(x, y, angle, count, speed, burst) {
    for (let i = 0; i < count; i++) { const a = burst ? Math.random() * Math.PI * 2 : (angle || 0) + (Math.random() - .5) * 1.4, v = Math.random() * speed + 1.2; particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 22 + Math.random() * 20, max: 42, color: BLOOD[i % BLOOD.length], size: 1.4 + Math.random() * 2.6, blood: true }); }
    addStain(x, y, burst ? 10 : 5);
  }
  function drawStains(now) {
    for (let i = stains.length - 1; i >= 0; i--) {
      const s = stains[i], age = now - s.born; if (age > STAIN_LIFE) { stains.splice(i, 1); continue; }
      ctx.globalAlpha = age < 14000 ? .8 : .8 * (1 - (age - 14000) / (STAIN_LIFE - 14000)); ctx.fillStyle = '#8f1d1d';
      for (const b of s.blobs) { ctx.beginPath(); ctx.arc(s.x + b.dx, s.y + b.dy, b.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function addParticles(x, y, color, count, speed) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * speed + 1; particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 20 + Math.random() * 18, max: 38, color, size: 1.5 + Math.random() * 2.5 }); } }
  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= p.blood ? .91 : .94; p.vy *= p.blood ? .91 : .94; p.life--;
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; if (p.blood) ctx.shadowBlur = 0; else { ctx.shadowColor = p.color; ctx.shadowBlur = 9; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      if (p.life <= 0) { if (p.blood && Math.random() < .3) addStain(p.x, p.y, p.size * 1.1); particles.splice(i, 1); }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function draw(time = 0) {
    drawArena(); drawStains(performance.now());
    for (const b of world.bullets) { ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = b.color || '#ffd166'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }
    for (const p of world.players) drawPlayer(p, time);
    drawParticles();
    if (hitFlash > 0) { const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * .35, canvas.width / 2, canvas.height / 2, canvas.width * .62); g.addColorStop(0, 'rgba(185,28,28,0)'); g.addColorStop(1, `rgba(185,28,28,${.5 * hitFlash})`); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); hitFlash = Math.max(0, hitFlash - .06); }
    const me = world.players.find(p => p.id === myId);
    if (me && me.hp <= 0) { ctx.fillStyle = '#b42318'; ctx.font = '800 26px "Barlow Condensed",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ELIMINATED — RESPAWNING', canvas.width / 2, 48); }
    if (me) { ctx.textAlign = 'left'; ctx.fillStyle = '#1f2937'; ctx.font = '600 11px "DM Mono",monospace'; ctx.fillText(weaponNames[me.weapon] || 'PULSE RIFLE', 18, 28); ctx.textAlign = 'right'; ctx.fillStyle = '#92400e'; ctx.fillText(`KILLS ${me.kills}/${killLimit}`, canvas.width - 18, 28); }
    requestAnimationFrame(draw);
  }
  function updateScoreboard() { const players=[...world.players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths);$('playerCount').textContent=`${players.length} PLAYER${players.length===1?'':'S'}`;$('scoreboard').innerHTML='';for(const p of players){const row=document.createElement('div');row.className='score-row';const swatch=document.createElement('div');swatch.className='swatch';swatch.style.background=p.color;swatch.style.color=p.color;const info=document.createElement('div');info.className='score-info';const name=document.createElement('div');name.className='score-name';name.textContent=p.name+(p.id===myId?' (YOU)':'');const health=document.createElement('div');health.className='health';const fill=document.createElement('span');fill.style.width=p.hp+'%';fill.style.background=p.hp>55?'#54f1d1':p.hp>25?'#ffd166':'#ff718d';health.appendChild(fill);const idLine=document.createElement('div');idLine.className='score-id';idLine.textContent='ID '+p.pid;info.append(name,idLine,health);const score=document.createElement('div');score.className='score-num';score.textContent=`${p.kills}/${killLimit} KILLS`;const deaths=document.createElement('small');deaths.textContent=`${p.deaths} deaths · ${weaponNames[p.weapon]||''}`;score.appendChild(deaths);row.append(swatch,info,score);$('scoreboard').appendChild(row);}}
  function startAudio(){if(!soundOn)return;try{if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();if(!musicTimer){let n=0;musicTimer=setInterval(()=>{if(!soundOn||!audioCtx)return;const notes=[110,146.83,164.81,130.81];tone(notes[n++%notes.length],.22,'sine',.018);},650);}}catch{}}
  function tone(freq,duration,type='sine',volume=.04){if(!soundOn||!audioCtx)return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}catch{}}
  function sound(type){if(!soundOn)return;startAudio();if(type==='shoot')tone(440,.055,'square',.018);if(type==='hit'){tone(180,.09,'sawtooth',.035);tone(90,.12,'sine',.025);}if(type==='kill'){tone(520,.12,'triangle',.05);setTimeout(()=>tone(780,.2,'triangle',.04),80);}if(type==='win'){tone(523,.15,'triangle',.05);setTimeout(()=>tone(659,.15,'triangle',.05),140);setTimeout(()=>tone(784,.35,'triangle',.05),280);}}
  function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=null;}}
  function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800);}
  requestAnimationFrame(draw);
})();
