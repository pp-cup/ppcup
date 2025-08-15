# PPCup (Timeweb-ready)

## Локальный запуск
```bash
cp .env.example .env   # заполните переменные
npm install
npm start
```

## Деплой на Timeweb Cloud (2 способа)

### Способ A: Тип приложения — Dockerfile (рекомендуется)
1. В панели Timeweb → «Приложения» → «Создать» → **Dockerfile**.
2. Репозиторий/архив: загрузите этот проект или подключите GitHub.
3. **Команда сборки**: *пусто* (или `docker build` заполнится автоматически).
4. Никаких `npm start` на этапе сборки!
5. Переменные окружения:
   - `SESSION_SECRET`
   - `OSU_CLIENT_ID`
   - `OSU_CLIENT_SECRET`
   - `OSU_REDIRECT_URI` (например `https://<ваш-домен>/auth/callback`)
   - (опц.) `COOKIE_SECURE=true`
6. Запускается автоматически: `CMD ["node","server.js"]` из Dockerfile.
7. Откройте приложение по выданному домену.

### Способ B: Тип приложения — Node.js (если доступен)
1. Создайте приложение типа **Node.js** (не «Другой/Static advanced»).
2. **Команда сборки:** `npm install`
3. **Команда запуска:** `node server.js` (или `npm start`)
4. **Порт:** платформа выставит `PORT` → код слушает `0.0.0.0:${PORT}`.
5. Добавьте переменные окружения как выше.
6. Откройте домен приложения.

## Настройка OAuth в osu!
- В настройках вашего osu! OAuth-приложения укажите Redirect URI из `.env` (`OSU_REDIRECT_URI`).
