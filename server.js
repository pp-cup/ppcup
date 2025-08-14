require("dotenv").config();
const express = require("express");
const axios = require("axios");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Настройка сессий =====
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(express.json());
app.use(express.static("public"));

// ===== Работа с JSON-базой =====
const DATA_FILE = path.join(__dirname, "participants.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function calculatePoints(ppStart, ppEnd) {
  return ppEnd - ppStart;
}

// ===== Авторизация через osu! =====
app.get("/auth/osu", (req, res) => {
  const redirectUri = process.env.REDIRECT_URI;
  res.redirect(
    `https://osu.ppy.sh/oauth/authorize?client_id=${process.env.OSU_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=identify`
  );
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");

  try {
    const tokenRes = await axios.post("https://osu.ppy.sh/oauth/token", {
      client_id: process.env.OSU_CLIENT_ID,
      client_secret: process.env.OSU_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.REDIRECT_URI,
    });

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get("https://osu.ppy.sh/api/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    req.session.user = userRes.data;
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Auth error");
  }
});

// ===== API для добавления участника =====
app.post("/api/participate", (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Not logged in" });

  const user = req.session.user;
  let data = loadData();

  if (data.some((p) => p.UserID === user.id)) {
    return res.status(400).json({ error: "User already participating" });
  }

  const ppStart = user.statistics?.pp || 0;
  const ppEnd = ppStart + 1000; // тестовое значение

  const newEntry = {
    Avatar: user.avatar_url || "",
    Nickname: user.username,
    UserID: user.id,
    PPstart: ppStart,
    PPend: ppEnd,
    Points: calculatePoints(ppStart, ppEnd),
  };

  data.push(newEntry);
  saveData(data);
  res.json({ success: true, entry: newEntry });
});

// ===== API для получения списка участников =====
app.get("/api/participants", (req, res) => {
  res.json(loadData());
});

// ===== Админка =====
app.delete("/api/admin/delete/:userID", (req, res) => {
  if (!req.session.user || req.session.user.username !== "LLIaBKa") {
    return res.status(403).json({ error: "Access denied" });
  }

  let data = loadData();
  data = data.filter((p) => p.UserID !== parseInt(req.params.userID));
  saveData(data);
  res.json({ success: true });
});

app.delete("/api/admin/clear", (req, res) => {
  if (!req.session.user || req.session.user.username !== "LLIaBKa") {
    return res.status(403).json({ error: "Access denied" });
  }

  saveData([]);
  res.json({ success: true });
});

// ===== Запуск сервера =====
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
