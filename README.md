# LetsGo

Персональная афиша событий Москвы. Пользователь описывает свои интересы, а LetsGo ищет подходящие мероприятия, объясняет рекомендации, сохраняет избранное и отправляет напоминания в Telegram.

## Возможности

- свободное описание интересов: например, «люблю джаз, маленькие выставки и средневековые фестивали»;
- ручной поиск событий по отдельному запросу;
- ежедневный поиск новых событий по сохранённым интересам;
- список «Найдено сегодня» без повторов;
- объяснение, почему событие подходит пользователю;
- избранные события;
- напоминание за неделю до события через Telegram-бота;
- кнопка «Пойдём?» для отправки события в Telegram.

## Стек

- Next.js 15 и React 19;
- TypeScript;
- Supabase / PostgreSQL;
- Groq API;
- Telegram Bot API;
- Vercel Functions и Vercel Cron.

## Запуск локально

```bash
npm install
npm run dev
```

Приложение будет доступно по адресу [http://localhost:3000](http://localhost:3000).

Для production-сборки:

```bash
npm run build
npm start
```

## Переменные окружения

Создайте файл `.env.local` на основе `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_SEARCH_MODEL=groq/compound-mini

TELEGRAM_BOT_TOKEN=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
CRON_SECRET=
```

Файл `.env.local` не должен добавляться в Git. Секретные ключи нельзя размещать во фронтенд-коде или README.

## Supabase

1. Создайте проект в Supabase.
2. Откройте **SQL Editor**.
3. Выполните [`supabase/schema.sql`](./supabase/schema.sql).

Схема содержит таблицы пользователей, событий и избранного.

## Telegram

Создайте бота через [@BotFather](https://t.me/BotFather) и добавьте токен в `.env.local`.

После деплоя установите webhook на адрес:

```text
https://YOUR_DOMAIN/api/telegram/webhook
```

Telegram webhook сохраняет пользователя и его `chat_id` в Supabase после команды `/start`.

## Деплой на Vercel

Подключите GitHub-репозиторий `Northinrtm/lets-go` к Vercel и добавьте переменные окружения из `.env.local` в настройках проекта.

`vercel.json` содержит два ежедневных задания:

- `/api/cron/daily-search` — поиск новых событий;
- `/api/cron/send-reminders` — напоминания об избранных событиях.

Расписание Vercel использует UTC. Текущее расписание `0 6 * * *` соответствует 09:00 по московскому времени.

## Статус

Базовый MVP собран и разворачивается на Vercel. Следующие этапы — полноценное подключение авторизации Telegram, сохранение результатов поиска в Supabase и обработка реальных событий в ежедневном Cron-процессе.
