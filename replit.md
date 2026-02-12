# replit.md

## Overview

This is a **church check-ins app** designed for Sunday welcoming teams to quickly capture newcomer and visitor information. It replaces Planning Center's native check-ins flow, which is too slow for newcomers. The app uses a card-based family group UI with person tiles that can be toggled between types (man/woman/boy/girl). It supports two modes: **unlocked** (fast capture, structure editing) and **locked** (data editing). The app is built for 3–4 concurrent mobile users with real-time sync via WebSockets. Speed of capture is prioritized over data correctness — messy/incomplete data is expected and can be cleaned up later by an admin.

### Authentication
- **Replit Auth** (OpenID Connect) — users must sign in before accessing the app
- Landing page shown at `/` when not authenticated, with a "Sign In to Continue" button
- All API routes protected with `isAuthenticated` middleware
- Auth files in `server/replit_integrations/auth/` — do not modify
- Auth schema in `shared/models/auth.ts` (users + sessions tables) — exported from `shared/schema.ts`
- Client-side auth hook: `client/src/hooks/use-auth.ts`
- Logout button in Dashboard header navigates to `/api/logout`

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query with optimistic updates for instant UI feedback
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming, custom fonts (DM Sans, Outfit)
- **Animations**: Framer Motion for smooth card/tile interactions
- **Icons**: Lucide React
- **Build Tool**: Vite with React plugin
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, executed via `tsx`
- **Real-time**: WebSocket server (ws library) mounted at `/ws` for broadcasting updates to all connected clients
- **API Style**: RESTful JSON API under `/api/` prefix
- **API Contract**: Shared route definitions in `shared/routes.ts` with Zod validation schemas

### Data Layer
- **Database**: PostgreSQL (connection via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema-to-validation integration
- **Schema Location**: `shared/schema.ts` — shared between client and server
- **Migrations**: Drizzle Kit with `drizzle-kit push` for schema syncing
- **Tables**:
  - `churches` — id, name, description, logoUrl, createdAt
  - `church_members` — id, churchId (FK), userId (FK to users), role (admin/member), status (pending/approved), createdAt
  - `families` — id, churchId (FK), name, status (newcomer/visitor), notes, serviceDate, serviceTime, createdAt
  - `people` — id, familyId (FK), type (man/woman/boy/girl), firstName, lastName, ageBracket, status, createdAt
  - `users` — id, email, firstName, lastName, profileImageUrl (managed by Replit Auth)
  - `sessions` — sid, sess, expire (managed by Replit Auth)
- **Relations**: One church has many members and families; one family has many people
- **Multi-tenancy**: All family/person data is scoped to a church via churchId; server derives churchId from authenticated user's approved membership (never from client)

### Real-time Sync
- WebSocket connection at `/ws` with automatic reconnection (3s delay)
- **Sync-on-mode-switch model**: Individual mutations do NOT broadcast to other clients. Instead, when a user switches from unlocked → locked mode, the client calls `POST /api/sync` which broadcasts an `UPDATE` event to all other connected clients.
- Other clients receiving the update see a conflict warning dialog ("Editing Clash Detected") and their cache is invalidated to refetch latest data
- The syncing client suppresses its own conflict dialog for 2 seconds using `suppressConflict()` in `use-ws.ts`
- Last-write-wins conflict resolution (acceptable for this use case)
- All mutations use optimistic updates with temp IDs replaced by server-returned real IDs in `onSuccess`

### Build & Deployment
- **Dev**: `tsx server/index.ts` with Vite dev server middleware (HMR at `/vite-hmr`)
- **Build**: Custom `script/build.ts` — Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Production**: `node dist/index.cjs` serves static files from `dist/public`

### Key Design Decisions
1. **Shared schema between client and server** — Types and validation schemas in `shared/` ensure consistency without duplication
2. **Optimistic updates** — Mutations immediately update the UI before server confirmation for perceived speed
3. **Mobile-first layout** — Max-width constrained even on desktop, card-based design optimized for touch
4. **Mode switching** — Unlocked mode for fast structural capture (add/remove people, toggle types), locked mode for editing details (names, notes)

## External Dependencies

### Database
- **PostgreSQL** — Required. Must have `DATABASE_URL` environment variable set. Used via `pg` Pool with Drizzle ORM.

### Key NPM Packages
- `express` v5 — HTTP server
- `ws` — WebSocket server for real-time sync
- `drizzle-orm` + `drizzle-kit` — Database ORM and migration tooling
- `drizzle-zod` — Auto-generate Zod schemas from Drizzle table definitions
- `@tanstack/react-query` — Server state management with caching
- `framer-motion` — Layout animations
- `wouter` — Client-side routing
- `zod` — Runtime validation
- `connect-pg-simple` — PostgreSQL session store (available but sessions not currently core)

### Replit-specific
- `@replit/vite-plugin-runtime-error-modal` — Dev error overlay
- `@replit/vite-plugin-cartographer` — Dev tooling (dev only)
- `@replit/vite-plugin-dev-banner` — Dev banner (dev only)

### No External APIs
- No third-party API integrations currently. The app is self-contained with its own PostgreSQL database and WebSocket server.