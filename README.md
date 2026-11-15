# City Explorer

Монорепозиторий на pnpm: клиент в `frontend` и сервер в `backend`.

## Стек

**frontend** — React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Axios, Zod, Zustand, React Router.

**backend** — Next.js (App Router, Route Handlers), TypeScript, Zod, PostgreSQL через Drizzle ORM (`pg`), Argon2id (`@node-rs/argon2`).

Тесты — Vitest: backend гоняет маршруты на встроенном PostgreSQL (PGlite) с настоящими миграциями, frontend — store и репозитории в jsdom.

## Запуск

```bash
pnpm install
docker compose up -d db          # локальный PostgreSQL 17 (или свой сервер, см. ниже)
cp backend/.env.example backend/.env   # если .env ещё нет; заполнить ключи
pnpm db:migrate
pnpm dev
```

Фронтенд открывается на http://localhost:5173, бэкенд — на http://localhost:3000. По отдельности: `pnpm dev:frontend`, `pnpm dev:backend`. Тесты: `pnpm test`.

Базовый URL API для клиента задаётся через `VITE_API_BASE_URL`. Если переменная не указана, используется `http://localhost:3000`.

Без PostgreSQL приложение работает в гостевом режиме: поездки в браузере, чат через `/api/chat`. Регистрация и вход в этом случае отвечают `503`.

## PostgreSQL и миграции

Строка подключения — `DATABASE_URL` в `backend/.env`:

```
DATABASE_URL=postgres://city_explorer:city_explorer@localhost:5432/city_explorer
```

`docker-compose.yml` в корне поднимает сервер с этими учётными данными. Для своего сервера создайте пустую базу и пользователя-владельца, затем укажите их в `DATABASE_URL`.

| Команда (из корня или `backend`) | Что делает |
| --- | --- |
| `pnpm db:migrate` | применяет миграции из `backend/src/infrastructure/database/migrations`; повторный запуск ничего не меняет |
| `pnpm --filter backend db:generate` | после изменения `schema.ts` создаёт новую миграцию |
| `pnpm --filter backend db:studio` | Drizzle Studio для просмотра данных |

Миграции только добавляют объекты; применённые миграции записываются в таблицу `drizzle.__drizzle_migrations`. Схема — `backend/src/infrastructure/database/schema.ts`.

### Таблицы

| Таблица | Поля | Связи и индексы |
| --- | --- | --- |
| `users` | `id` uuid, `username` (в нижнем регистре), `password_hash` (Argon2id), `created_at`, `updated_at` | уникальный `username` |
| `sessions` | `id`, `user_id`, `token_hash` (SHA-256 токена), `expires_at`, `created_at`, `last_activity_at` | FK → users `ON DELETE CASCADE`; уникальный `token_hash`; индексы по `user_id`, `expires_at` |
| `user_settings` | `id`, `user_id`, `language` (`ru`/`en`), `theme` (`light`/`dark`), `created_at`, `updated_at` | FK → users cascade; уникальный `user_id`; CHECK на значения |
| `trips` | `id`, `user_id`, `name`, `place` jsonb, `start_date`, `end_date`, `hotel`, `prefs`, `hints` jsonb, `conversation_context` jsonb, `version`, `guest_id`, `created_at`, `updated_at` | FK → users cascade; индекс (`user_id`, `created_at`); уникальный (`user_id`, `guest_id`) против повторного импорта; CHECK `start_date <= end_date` |
| `trip_messages` | `id`, `trip_id`, `seq`, `role` (`user`/`assistant`/`system`), `content`, `settings_update` jsonb, `created_at` | FK → trips cascade; индекс (`trip_id`, `seq`) |
| `trip_plans` | `id`, `trip_id`, `seq`, `start_date`, `end_date`, `days` jsonb, `created_at` | FK → trips cascade; индекс (`trip_id`, `seq`); последняя версия — актуальный план |

Удаление пользователя удаляет его сессии, настройки и поездки; удаление поездки — её сообщения и планы.

## Режимы работы

- **Гость** — поездки, сообщения, язык и тема в `localStorage` (ключ `city-explorer-trips`, формат прежний). Ответы модели — `POST /api/chat`: клиент отправляет настройки поездки, актуальный план, `conversationContext` и неотвеченные сообщения; сервер строит промпт и возвращает ответ, уже применённый к поездке.
- **Аккаунт** — всё хранится в PostgreSQL и читается через API; при перезагрузке данные приходят с сервера. Гостевые данные в браузере при этом не трогаются и возвращаются после выхода.

При входе или регистрации, если в браузере есть гостевые поездки, приложение предлагает перенести их в аккаунт. Перенос идёт одной транзакцией; уже перенесённые поездки пропускаются; из браузера поездки удаляются только после ответа сервера.

## API

Все ошибки: `{ "error": "<сообщение>", "code": "<код>" }`. Маршруты аккаунта требуют сессию (`401 unauthorized`); чужая поездка — `404 trip_not_found`, как и несуществующая.

| Метод и путь | Тело запроса | Ответ |
| --- | --- | --- |
| `POST /api/auth/register` | `{ username, password, settings? }` | `201 { user, settings }` + cookie; `409 username_taken` |
| `POST /api/auth/login` | `{ username, password }` | `{ user, settings }` + cookie; `401 invalid_credentials`; `429 rate_limited` |
| `POST /api/auth/logout` | — | `204`, cookie очищена |
| `GET /api/auth/me` | — | `{ user, settings }` или `401` |
| `DELETE /api/auth/sessions` | — | `204`, завершены все сессии пользователя |
| `GET /api/account/settings` | — | `{ language, theme }` |
| `PATCH /api/account/settings` | `{ language?, theme? }` | `{ language, theme }` |
| `POST /api/account/import-guest-data` | `{ trips: GuestTrip[] }` | `{ imported, skipped, trips }` |
| `GET /api/trips` | — | `Trip[]` (с сообщениями и версиями плана) |
| `POST /api/trips` | `{ id?, name? }` | `201 Trip`; повтор с тем же `id` — `200` |
| `GET /api/trips/:id` | — | `Trip` |
| `PATCH /api/trips/:id` | `{ name?, place?, details? }` | `Trip`; смена настроек добавляет системное сообщение; смена города — `400 destination_locked` |
| `DELETE /api/trips/:id` | — | `204` |
| `GET /api/trips/:id/messages` | — | `Message[]` |
| `POST /api/trips/:id/messages` | `{ messages: [{ id, text }] }` | `Trip` с ответом ассистента; `502 llm_unavailable` (сообщения сохранены); `409 trip_changed`; `429 rate_limited` |
| `POST /api/trips/:id/reply` | — | `Trip`: первый план или ответ на изменение настроек; `429 rate_limited` |
| `POST /api/chat` | `{ language, trip, turns }` | `{ message, details, plan, hints, conversationContext }`, без авторизации, только с разрешённого `Origin`; `429 rate_limited` |
| `GET /api/locations/suggest` | `?query&language` | список городов; `429 rate_limited` |

## Безопасность

- Пароли — Argon2id (19 MiB, t=2, p=1). Неверный логин и неверный пароль дают одинаковый ответ; для несуществующего логина тоже выполняется проверка хеша.
- Сессия — 256-битный случайный токен в cookie `ce_session` (`__Host-ce_session` в production): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 дней, `Secure` в production. В БД хранится только SHA-256 токена. Срок проверяется на каждом запросе, активная сессия продлевается не чаще раза в час.
- CSRF: изменяющие запросы принимаются только с разрешённым `Origin` и `Content-Type: application/json`. CORS отдаёт конкретный origin с `Access-Control-Allow-Credentials: true`, никогда `*`.
- Попытки входа ограничены по IP и по логину, регистрации — по IP (в памяти процесса).
- Запросы, которые тратят деньги или квоту, ограничены (`app/api/_lib/rate-limit.ts`, в памяти процесса): гостевой чат — 30 ответов за 10 минут с одного адреса и 600 на всех; ответы модели в аккаунте — 60 за 10 минут на пользователя; подсказки городов — 180 в минуту с адреса; импорт гостевых данных — 20 в час на пользователя. Превышение — `429` с `Retry-After`.
- Гостевой чат принимает запросы только с разрешённого `Origin` и с телом до 300 КБ; остальные маршруты — до 1 МБ (импорт — до 10 МБ). Размер считается по мере чтения, поэтому тело без `Content-Length` лимит не обходит.
- Ответ модели ограничен по времени (5 минут на все запросы и повторы). Координаты мест берутся из результатов геокодера и сохранённого плана, а не из текста модели; место с неизвестным id дальше 500 км от города отбрасывается.
- Настройки поездки, которые вводит пользователь, попадают в промпт одной строкой: переносы строк сворачиваются, чтобы значение не могло выдать себя за раздел инструкций.
- Ответы API отдаются с `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'`; в production добавляется `Strict-Transport-Security`.
- Логгер вырезает параметры SQL из ошибок, пароли и токены не логируются. Ожидаемые отказы (4xx) в лог не пишутся.

**Развёртывание.** Cookie с `SameSite=Lax` отправляется только в пределах одного сайта: frontend и backend должны жить на одном регистрируемом домене (`app.example.com` и `api.example.com`) или API должен проксироваться через домен frontend. Origin frontend указывается в `CORS_ORIGINS`.

Backend должен стоять за обратным прокси, который дописывает адрес клиента в `X-Forwarded-For`; число таких прокси задаёт `TRUST_PROXY` (`true` — один, либо число). Адрес клиента берётся как N-я запись с конца заголовка: всё, что левее, прислал сам клиент. Без прокси заголовок можно подделать целиком, и лимиты по адресу превращаются в общий потолок гостевого чата. Счётчики лимитов живут в памяти процесса: для нескольких экземпляров backend нужен общий стор за тем же интерфейсом `RateLimiter`.
