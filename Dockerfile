# Используем Node.js образ в качестве базового
FROM node:16-alpine

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем все файлы приложения в контейнер
COPY . .

# Устанавливаем переменные окружения
ENV NODE_ENV production
# Если у Вас есть другие переменные окружения, добавьте их здесь, например:
# ENV OSU_CLIENT_ID=your_osu_client_id
# ENV OSU_CLIENT_SECRET=your_osu_client_secret
# ENV REDIRECT_URI=your_redirect_uri
# ENV SESSION_SECRET=your_session_secret

# Открываем порт, который слушает приложение
EXPOSE 3000

# Запускаем приложение
CMD ["node", "server.js"]