# City Explorer

Монорепозиторий на pnpm: клиент в `frontend` и сервер в `backend`.

## Стек

**frontend** — React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Axios, Zod, Zustand, React Router.

**backend** — Next.js (App Router) и TypeScript.

## Запуск

```bash
pnpm install
pnpm dev:frontend
pnpm dev:backend
```

Фронтенд открывается на http://localhost:5173, бэкенд — на http://localhost:3000. Оба процесса сразу: `pnpm dev`.

Базовый URL API для клиента задаётся через `VITE_API_BASE_URL`. Если переменная не указана, используется `http://localhost:3000`.
