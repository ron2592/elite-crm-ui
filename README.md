# ComCenter — Modern Sales Pipeline Dashboard

A production-ready CRM dashboard built with **Next.js 14 App Router**, **TypeScript**, **Tailwind CSS**, and **shadcn/ui**.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui + Radix UI primitives
- **Charts**: Recharts
- **Icons**: Lucide React
- **Fonts**: DM Sans + Syne (via Google Fonts)

## Features

- **Dashboard** — KPI cards (Leads, Appointments, Close Rate, Revenue) + Revenue area chart + Pipeline summary
- **Leads Pipeline** — Kanban board with 6 stages, lead cards with value/source/tags, clickable detail modal
- **Calendar** — Weekly time-grid view with appointment blocks, detail dialog on click
- **Tasks** — Task list with toggle-complete, priority badges, filter by status
- **Activities** — Table of calls, emails, follow-ups with type/status/date
- **Settings** — Profile, account, workspace, billing sections

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
app/
  (app)/
    dashboard/     → KPI + charts
    leads/         → Kanban pipeline
    calendar/      → Weekly calendar
    tasks/         → Task manager
    activities/    → Activity log
    settings/      → Settings page
  globals.css
  layout.tsx

components/
  layout/          → Sidebar, Header
  ui/              → shadcn/ui primitives
  dashboard/       → KpiCard, RevenueChart, PipelineSummary, RecentLeads
  leads/           → KanbanColumn, LeadCard, LeadDetailDialog
  calendar/        → AppointmentCard, AppointmentDialog
  tasks/           → (inline in page)
  activities/      → (inline in page)

lib/
  mock-data.ts     → All mock CRM data
  utils.ts         → cn() helper

types/
  index.ts         → TypeScript interfaces
```

## Deployment

Deploy to Vercel with zero config:

```bash
npx vercel
```

## Future: Supabase Integration

This project is designed to connect to Supabase. Replace `lib/mock-data.ts` imports with Supabase queries using the `@supabase/supabase-js` client and Next.js Server Components.
