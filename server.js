require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: true,
}));

const DB_PATH = path.join(__dirname, 'data', 'database.json');

// ===== Работа с JSON =====
function loadData() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ===== osu! API =====
let osuAccessToken = null;
const osuClientId = process.env.OSU_CLIENT_ID;
const osuClientSecret = process.env.OSU_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI || `https://${process.env.HOST}/auth/callback`;

async function fetchOsuAccessToken() {
  try {
    const response = await axios.post('https://osu.ppy.sh/oauth/token', {
      client_id: osuClientId,
      client_secret: osuClientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    });
    osuAccessToken = response.data.access_token;
    console.log('osu! access token получен');
  } catch (err) {
    console.error('Ошибка получения токена:', err.response?.data || err.message);
  }
}

// ===== Логика участников =====
function calculatePoints(ppStart, ppEnd) {
  const start = Math.floor(ppStart);
  const end = Math.floor(ppEnd);
  if (end <= start) return 0;

  let points = 0;
  const floorStart = Math.floor(start / 1000) * 1000;
  const floorEnd = Math.floor(end / 1000) * 1000;

  for (let thousand = floorStart; thousand <= floorEnd; thousand += 1000) {
    const lower = Math.max(start, thousand);
    const upper = Math.min(end, thousand + 999.999);
    const delta = upper - lower;
    if (delta > 0) points += delta * (thousand / 1000);
  }
  return Math.round(points);
}

function updatePositions(data) {
  data.sort((a, b) => b.Points - a.Points);
  let lastPoints = null;
  let lastPosition = 0;
  data.forEach((p, i) => {
    if (p.Points !== lastPoints) {
      lastPosition = i + 1;
      lastPoints = p.Points;
    }
    p.Position = lastPosition;
  });
}

// ===== Обновление PP участников =====
async function updateParticipantsPP() {
  if (!osuAccessToken) {
    await fetchOsuAccessToken();
    if (!osuAccessToken) return;
  }

  const data = loadData();
  for (let participant of data) {
    try {
      const res = await axios.get(`https://osu.ppy.sh/api/v2/users/${participant.Nickname}/osu`, {
        headers: { Authorization: `Bearer ${osuAccessToken}` }
      });
      const currentPP = res.data.statistics.pp;
      participant.PPend = currentPP;
      participant.Points = calculatePoints(participant.PPstart, currentPP);
    } catch (err) {
      console.error(`Ошибка обновления ${participant.Nickname}:`, err.response?.data || err.message);
    }
  }
  updatePositions(data);
  saveData(data);
}

// ===== API =====
app.get('/api/data', (req, res) => {
  const data = loadData();
  updatePositions(data);
  saveData(data);
  res.json(data);
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({});
  res.json(req.session.user);
});

// ===== OAuth =====
app.get('/auth/login', (req, res) => {
  const authUrl = `https://osu.ppy.sh/oauth/authorize?client_id=${osuClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=public`;
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    const tokenRes = await axios.post('https://osu.ppy.sh/oauth/token', {
      client_id: osuClientId,
      client_secret: osuClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get('https://osu.ppy.sh/api/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    req.session.user = userRes.data;
    res.redirect('/');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Authorization error');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ===== Участие =====
app.post('/api/participate', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const user = req.session.user;
  const data = loadData();
  if (data.some(p => p.Nickname === user.username))
    return res.status(400).json({ error: 'Already participating' });

  const ppStart = user.statistics?.pp || 0;
  const ppEnd = ppStart + 1000;
  const newEntry = { UserID: user.id, Nickname: user.username, Avatar: user.avatar_url, PPstart: ppStart, PPend: ppEnd, Points: calculatePoints(ppStart, ppEnd) };
  data.push(newEntry);
  updatePositions(data);
  saveData(data);
  res.json({ success: true, participant: newEntry });
});

app.post('/api/unparticipate', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const user = req.session.user;
  let data = loadData();
  data = data.filter(p => p.Nickname !== user.username);
  updatePositions(data);
  saveData(data);
  res.json({ success: true });
});

// ===== Админка =====
app.delete('/api/participant/:nickname', (req, res) => {
  if (!req.session.user || req.session.user.username !== 'LLIaBKa')
    return res.status(403).json({ error: 'Not authorized' });

  let data = loadData();
  data = data.filter(p => p.Nickname !== req.params.nickname);
  saveData(data);
  res.json({ success: true });
});

app.delete('/api/participants', (req, res) => {
  if (!req.session.user || req.session.user.username !== 'LLIaBKa')
    return res.status(403).json({ error: 'Not authorized' });

  saveData([]);
  res.json({ success: true });
});

// ===== Сразу запускаем сервер =====
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);

  // ===== Фоновые задачи после старта =====
  (async () => {
    await fetchOsuAccessToken();
    await updateParticipantsPP();
    setInterval(updateParticipantsPP, 10 * 60 * 1000);
  })();
});
