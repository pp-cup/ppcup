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
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
}));

const DB_PATH = path.join(__dirname, 'data', 'database.json');

// === Работа с данными ===
const loadData = () => {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH));
};

const saveData = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// === osu! API токен ===
let osuAccessToken = null;
const osuClientId = process.env.OSU_CLIENT_ID;
const osuClientSecret = process.env.OSU_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

const fetchOsuAccessToken = async () => {
  try {
    const res = await axios.post('https://osu.ppy.sh/oauth/token', {
      client_id: osuClientId,
      client_secret: osuClientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    });
    osuAccessToken = res.data.access_token;
    console.log('osu! access token получен');
  } catch (err) {
    console.error('Ошибка получения токена:', err.response?.data || err.message);
  }
};

const calculatePoints = (ppStart, ppEnd) => {
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
};

const updatePositions = (data) => {
  data.sort((a, b) => b.Points - a.Points);
  let lastPoints = null, lastPosition = 0;
  data.forEach((p, idx) => {
    if (p.Points !== lastPoints) lastPosition = idx + 1;
    lastPoints = p.Points;
    p.Position = lastPosition;
  });
};

// === Обновление PP участников ===
const updateParticipantsPP = async () => {
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
      participant.PPend = res.data.statistics.pp;
      participant.Points = calculatePoints(parseFloat(participant.PPstart), participant.PPend);
    } catch (err) {
      console.error(`Ошибка обновления ${participant.Nickname}:`, err.response?.data || err.message);
    }
  }
  updatePositions(data);
  saveData(data);
};

// === API ===
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

// OAuth
app.get('/auth/login', (req, res) => {
  const url = `https://osu.ppy.sh/oauth/authorize?client_id=${osuClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=public`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    const tokenResp = await axios.post('https://osu.ppy.sh/oauth/token', {
      client_id: osuClientId,
      client_secret: osuClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const accessToken = tokenResp.data.access_token;
    const userResp = await axios.get('https://osu.ppy.sh/api/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    req.session.user = userResp.data;
    res.redirect('/');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Authorization error');
  }
});

// Участие
app.post('/api/participate', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const user = req.session.user;
  const data = loadData();

  if (data.some(p => p.Nickname === user.username))
    return res.status(400).json({ error: 'User already participating' });

  const ppStart = user.statistics?.pp || 0;
  const ppEnd = ppStart + 1000;

  const newEntry = {
    UserID: user.id,
    Avatar: user.avatar_url || '',
    Nickname: user.username,
    PPstart: ppStart,
    PPend: ppEnd,
    Points: calculatePoints(ppStart, ppEnd)
  };

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

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        console.log('Closed remaining connections');
        process.exit(0);
    });
});
