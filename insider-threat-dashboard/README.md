# InsiderDash — Frontend

The Next.js 15 dashboard for the [Insider Threat Dashboard](../README.md). It
provides the administrator threat console and the department file-access views,
talking to the Django REST backend over JSON and receiving real-time alerts over
WebSockets.

## Tech stack

- **Next.js 15** (App Router) + **React 19**
- **Material UI 5** (`@mui/material`, `@mui/icons-material`) for components
- **Recharts** for the dashboard charts
- **SWR** for data fetching and cache revalidation
- **Plus Jakarta Sans** via `next/font` for typography
- A single typed API client in [`src/lib/api.ts`](src/lib/api.ts) with automatic
  JWT refresh on 401

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app expects the backend
at `http://127.0.0.1:8000` by default (see [Environment](#environment)).

Make sure the backend is running (`python manage.py runserver` in
`insider-backend`) — with the default console email backend, OTP codes are
printed to the backend terminal, so you can sign in without a mail server.

## Environment

Create `.env.local` to point at a non-default backend:

```bash
# Base URL of the Django API (no trailing slash)
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000

# WebSocket host for live alerts (defaults to the current page host)
NEXT_PUBLIC_WS_HOST=127.0.0.1:8000
```

## Authentication & routing

There is a **single login entrance** (`/login`) for everyone — the app never
advertises a separate admin door. After email + password + OTP, the backend
returns the user's role, department and staff flag, and
[`src/lib/auth.ts`](src/lib/auth.ts) routes them:

| User                | Destination                    |
| ------------------- | ------------------------------ |
| Staff / admin       | `/dashboard` (threat console)  |
| Finance employee    | `/employee/finance/dashboard`  |
| IT employee         | `/employee/it/dashboard`       |

`/dashboard/*` is guarded client-side by [`src/app/dashboard/layout.tsx`](src/app/dashboard/layout.tsx)
(non-staff are redirected away), and the admin API endpoints independently
return 403 to non-staff — defence in depth.

## Project structure

```
src/
  app/
    page.tsx / landing/         Marketing landing page
    login/                      Single login entrance
    dashboard/                  Admin threat console (staff only)
      layout.tsx                Staff-only route guard
      page.tsx                  Overview: KPIs, alerts + triage, charts
      logs/ users/ ruleengine/  Audit logs, user management, access rules
      components/SideBar.tsx    Console navigation rail
    employee/
      finance|it/dashboard/     Department file-access views
    components/
      DepartmentFilesPage.tsx   Shared, access-controlled file browser
      AuthedTopBar.tsx          Signed-in top bar with sign-out
      EditAccessDialog.tsx      Grant role/user permissions on a resource
  lib/
    api.ts                      Typed fetch client (JWT + auto refresh)
    auth.ts                     Session helpers + post-login routing
    theme.ts                    Shared MUI theme + design tokens
    alertsSockets.ts            WebSocket client for live alerts
  types/                        Shared DTO types
```

## Design system

Colours, typography, spacing and the layered "glass" surfaces live in
[`src/lib/theme.ts`](src/lib/theme.ts) as a shared MUI theme plus a `tokens`
object. Import these rather than hard-coding hex values so the console and the
employee views stay visually consistent. Severity and risk colours are reserved
strictly for signalling (low → emerald, medium → amber, high → orange,
critical → rose).

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server (hot reload)    |
| `npm run build` | Production build (also type-checks)  |
| `npm run start` | Serve the production build           |
| `npm run lint`  | Run ESLint                           |
