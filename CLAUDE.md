# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Build for production
npm run lint     # Run ESLint
```

All commands run inside Docker — prefix with `docker compose exec -T app`:
```bash
docker compose exec -T app npm run lint
docker compose exec -T app npx tsc --noEmit
docker compose exec -T app npx prisma migrate dev --name <name>
docker compose exec -T app npx prisma generate   # after any schema.prisma change
docker compose exec -T app npx prisma db seed
docker compose exec -T app npx prisma studio   # GUI on port 5555
```

`docker-compose.yml` runs three services: `db` (Postgres 16), `face-service` (Python, port 8000) and `app` (Next.js dev). Both `app` and `face-service` read `.env.local`.

Maintenance scripts (`tsx`): `storage:sync`, `links:migrate`, `exif:backfill`, `seed:docs`, `screenshots[:auth|dashboard|events|gallery|settings]`, `docs:serve` (serves the static `docs/` site on port 4000). `scripts/setup-s3-cors.ts` configures bucket CORS.

No test runner is configured. Before pushing, run `npx tsc --noEmit`, `npm run lint` and `npm run build`. Lint has pre-existing errors (mostly `react-hooks/set-state-in-effect`, `react/no-unescaped-entities`), so compare the error count against `main` instead of expecting zero.

## Architecture

**PhotoHouse** — a photographer client gallery app built on Next.js App Router with TypeScript and Tailwind CSS v4.

### Stack

- **Next.js 16** App Router, React 19, TypeScript (strict), Tailwind CSS v4
- **PostgreSQL** via **Prisma 7** with `@prisma/adapter-pg`. Generated client lives at `src/generated/prisma` (not the default `node_modules/.prisma`)
- **NextAuth v4** — credentials provider, JWT sessions. Config in `src/lib/auth.ts`, types extended in `src/types/next-auth.d.ts` (`role: "PHOTOGRAPHER" | "SUPER_ADMIN"`)
- **AWS S3** (private bucket) + **CloudFront CDN** for photo delivery; **AWS SES** for email
- **Stripe** — checkout + billing portal. Webhook handler at `src/app/api/stripe/webhook/route.ts`
- **sharp** — thumbnails, watermarking, QR rendering
- **Python face service** (`services/face-service/main.py`) — face indexing/search/clustering and photo culling

### Folder structure

```
src/
  proxy.ts               # Next 16 "proxy" (formerly middleware): auth redirects, admin gating
  app/
    (auth)/              # Login + register (server page + *ClientPage.tsx)
    dashboard/           # Photographer home: event list, stats, create event, archived view
    dashboard/events/[id]/            # Event detail: photo grid, upload, people/faces, culling tabs
    dashboard/events/[id]/settings/   # Event settings page (sidebar of sections, see below)
    dashboard/events/[id]/selections/ # Customer photo selections
    dashboard/profile/   # Personal info, studio branding, watermark settings
    dashboard/billing/   # Current plan, Stripe portal
    admin/               # SUPER_ADMIN panel: photographers, plans, subscriptions, storage, events, activity, settings, webhook
    share/[slug]/        # Public customer gallery (PASSWORD / PIN / NONE access, no NextAuth)
    share/[slug]/preview/  # Photographer preview of a gallery (PreviewToken or owner session)
    maintenance/         # Shown when maintenance mode is on
    pricing/             # Public pricing page with Stripe checkout
    api/auth/            # NextAuth + force-signout
    api/download/[slug]/             # Streaming ZIP download (PRO/STUDIO only)
    api/download/photo/[photoId]/    # Single photo download with watermark
    api/download/selection/[selectionId]/  # Photographer-only ZIP of a customer selection
    api/share-grant/[slug]/          # Sets the share cookie for NONE-access links, then redirects
    api/preview/[linkId]/            # Owner-only: sets share cookie and redirects to the gallery
    api/qr/              # Photographer-only QR PNG (data URL) for the QR card preview
    api/cron/cleanup-face-sessions/  # Deletes expired selfie sessions (x-cron-secret header)
    api/stripe/webhook/  # Stripe webhook handler
    api/ping/            # Used by the upload network monitor
  components/
    gallery/             # Customer gallery building blocks (GalleryRoot theme provider, MasonryGrid, PhotoCard, SelectionBar, ThemeSwitcher, …)
    settings/            # Event settings sections (SettingsShell, *Section.tsx)
    ui/                  # icons.tsx, ThemeToggle (app light/dark)
  hooks/                 # useTheme, useUploadQueue, useInfoPanelState
  emails/                # React email templates (NewSelectionEmail)
  lib/                   # see "Key lib modules"
```

### Key lib modules

| Module | Purpose |
|---|---|
| `auth.ts`, `admin.ts` (`requireSuperAdmin`), `impersonation.ts` | Auth, admin guard, admin "log in as" photographer |
| `db.ts` | Prisma client singleton |
| `s3.ts` | Presigned upload URLs (photo, cover, logo), delete helpers |
| `cloudfront.ts` | `getCloudfrontSignedUrl` (originals — downloads only) and `getCloudfrontPreviewUrl(key, 800 \| 1920)` (resized, for display) |
| `thumbnail.ts` | Creates `…/thumbs/{name}-thumb.jpg` at upload time and returns the EXIF buffer |
| `exif.ts` | Parses EXIF into `Photo.exif*` fields |
| `uploadEngine.ts`, `uploadManager.ts`, `uploadQueue.ts`, `multipart.ts`, `retryEngine.ts`, `concurrencyController.ts`, `networkMonitor.ts` | Client upload pipeline: S3 multipart chunks, retry with backoff, adaptive concurrency, pause/resume on network loss, queue persisted in IndexedDB (`photohouse-uploads`) |
| `share-token.ts` | HMAC-SHA256 share-cookie tokens |
| `pin.ts` | Secure 4-digit PIN generation |
| `encryption.ts` | AES-256-GCM encryption (`ENCRYPTION_KEY`) — used for the Stripe webhook secret stored in DB |
| `platform-settings.ts` | `PlatformSettings` key/value table: maintenance mode, signups, plan storage/event limits, SES config, face AI switches and limits |
| `storage.ts` | Storage limits/usage helpers, `PLAN_CULLING_LIMITS` |
| `plans.ts` | `THEME_ACCESS` / `ANIMATION_ACCESS` per plan |
| `gallery-theme.ts` | Gallery theme tokens, custom theme builder, `resolveGalleryTheme`, `themeToCssVars` |
| `theme.ts` | App (dashboard) light/dark/system theme, stored in `localStorage` (`photohouse-theme`) |
| `qrGenerator.ts`, `qrCardGenerator.ts` | QR PNG + printable QR card / A4 sheet (sharp) |
| `faceService.ts`, `faceIndexing.ts`, `embedding.ts` | Face service HTTP client, indexing orchestration, embedding ⇄ `Bytes` |
| `cullClient.ts`, `cullingService.ts` | Culling HTTP client and orchestration |
| `ses.ts` | Sends the "new selection" email |
| `watermark.ts` | sharp watermark compositing |

### Key architectural decisions

**S3 key structure**
- Event photos: `photographers/{userId}/events/{eventId}/{timestamp}-{filename}`
- Thumbnails: `photographers/{userId}/events/{eventId}/thumbs/{timestamp}-{name}-thumb.jpg`
- Cover photos: `photographers/{userId}/events/{eventId}/cover/{timestamp}-{filename}`
- QR cards: `qr-cards/{sharedLinkId}.png` and `qr-cards/{sharedLinkId}-a4.png`

**Photo delivery flow**
- All photos served via CloudFront signed URLs — never direct S3 URLs
- Display uses thumbnails or `getCloudfrontPreviewUrl` (resized); `getCloudfrontSignedUrl` (original) is for downloads only
- The s3Key is never passed to client components — server generates signed URLs and passes those
- All customer downloads route through server endpoints:
  - Single photo: `GET /api/download/photo/[photoId]?slug={slug}`
  - Full or per-group ZIP: `GET /api/download/[slug][?group={groupId}]` (PRO/STUDIO only)
- Both endpoints verify the `share_{slug}` cookie, link expiry and the link's `downloadsEnabled` / `zipDownloadEnabled` before serving anything

**Upload flow**
- Browser uploads directly to S3 (multipart for large files) via `useUploadQueue` → `uploadEngine`
- `savePhotoRecord` (in `dashboard/events/[id]/actions.ts`) then creates the `Photo` row, generates the thumbnail, stores EXIF and dimensions, increments storage, and fires face indexing / culling in the background when enabled

**Share links & access**
- An event can have many `SharedLink`s; `accessType` is `PASSWORD` | `PIN` | `NONE`
- PASSWORD stores `passwordHash`; PIN stores a bcrypt `pin` plus `pinPlain` (so the photographer can see it and print it on QR cards)
- On correct password/PIN, the server sets an httpOnly cookie `share_{slug}` (path `/`) with an HMAC-signed token (`slug|exp|hmac`, 24h TTL)
- The token is signed with `NEXTAUTH_SECRET` (there is no separate share secret); `verifyShareToken()` uses `timingSafeEqual`
- `NONE` links redirect to `/api/share-grant/[slug]`, which sets the cookie (server components can't write cookies)
- Cookie path must be `/` (not `/share/{slug}`) so it is sent with requests to `/api/download/…`
- PIN attempts: in-memory lockout (5 attempts / 15 min) plus DB-backed `GalleryAccessAttempt` rate limiting
- Per-link settings: `expiresAt`, `faceSearchEnabled`, `downloadsEnabled`, `zipDownloadEnabled`, `selectionEnabled` (all enforced server-side), `groupVisibilityOverrides`, `defaultGridDensity`, QR card options (`showPinOnCard`, `customCardMessage`)
- Photographer preview: `/api/preview/[linkId]` (owner session) or `/share/[slug]/preview` with a `PreviewToken`

**Event settings page** (`/dashboard/events/[id]/settings`)
- `SettingsShell` + `SettingsSidebar` with sections in `src/components/settings/`: Event details, Gallery customisation, Shared links (incl. QR cards), Watermark, Culling, Face detection, Photo groups, Danger zone
- Server actions in `dashboard/events/[id]/settings/actions.ts` — each one checks the event/link belongs to `session.user.id`
- Danger zone: archive / unarchive (`isArchived`, `archivedAt`), revoke all links, delete event (cleans up S3 objects and decrements storage)
- Archived events are hidden from the dashboard (`/dashboard?archived=1` lists them) but **still count toward the event limit**, and their share links keep working

**Gallery customisation (event-level)**
- Lives on `Event` and applies to every shared link: `theme`, `customThemeData` (JSON, when `theme = "custom"`), `welcomeEnabled`, `welcomeMessage`, `welcomeHeroPhotoId`, `introAnimation`, `showPhotoCount`, `showEventDate`, `galleryTitle`, `gallerySubtitle`
- `SharedLink` still has older copies of these columns; the share page reads the **event** values
- Themes: `minimal | dark | cinematic | warm | ocean | forest | custom`. The photographer settings offer minimal/dark/cinematic/warm/custom; the customer `ThemeSwitcher` offers the predefined ones
- When adding a theme, update **all** of: `ThemeKey` + `PREDEFINED_THEMES` + `THEME_LABELS` + `THEME_PREVIEW_COLORS` in `gallery-theme.ts`, `THEMES` in `GalleryCustomisationSection.tsx`, `THEME_ACCESS` in `plans.ts`, and the `ThemeSwitcher` list. `resolveGalleryTheme` falls back to `minimal` for unknown keys
- Plan gating: `THEME_ACCESS` / `ANIMATION_ACCESS` in `src/lib/plans.ts` (FREE: minimal, dark / none, fade). Intro animations: `none | fade | reveal | typewriter | filmstrip`
- `GalleryRoot` provides the theme as CSS variables (`--g-*`); brand color overrides the accent except for `cinematic` and `custom`

**Studio branding on share pages**
- `StudioProfile` stores: `studioName`, `logoS3Key`, `tagline`, `website`, `phone`, `address`, `brandColor`
- `/share/[slug]` fetches the photographer's `studioProfile`; logo and studio name are shown on the PIN/password screens, welcome screen and gallery header
- `brandColor` is not validated on save — sanitise it before putting it into SVG/CSS (`qrGenerator` only accepts hex)

**Watermarking**
- Logic lives in `src/lib/watermark.ts` using `sharp`
- Only applied on PRO and STUDIO plans — FREE plan downloads are never watermarked
- Profile-level settings on `StudioProfile`: `watermarkEnabled`, `watermarkPosition` (`BOTTOM_RIGHT` | `BOTTOM_LEFT` | `BOTTOM_CENTER`), `watermarkOpacity` (int 10–80)
- If `logoS3Key` is set, logo is fetched from S3, resized to 8% of image width, and composited at the chosen position; falls back to SVG text watermark if logo fetch fails
- Text watermark is a full-size transparent SVG with drop-shadow filter
- `Event` also has per-event override fields (`watermarkOverride`, `watermarkEnabled`, `watermarkSource`, `watermarkPosition`, `watermarkOpacity`) edited in event settings — **the download endpoints don't read these yet**; they still use the profile settings

**Face recognition**
- Python face service endpoints: `/health`, `/index`, `/search`, `/cluster` (auth via `FACE_SERVICE_API_KEY`)
- Photos are indexed into `FaceRecord` (embedding as `Bytes`, crop in S3); clustering into `FaceCluster` is debounced (60s) per event; jobs tracked in `FaceIndexingJob`
- Customer "Find my photos": selfie uploaded to S3 → `FaceSearchSession` → `/search`; expired sessions cleaned by the cron route
- Feature switches, per-plan indexing/search access and monthly search limits come from `PlatformSettings`

**Admin panel** (`/admin`, `SUPER_ADMIN` only — enforced in `proxy.ts` and `requireSuperAdmin()`)
- Manage photographers (suspend, impersonate, delete), Stripe plans, subscriptions (manual overrides), storage, events, platform settings, webhook secret
- Admin actions are logged to `AdminActivityLog`
- Suspended photographers' galleries show a generic "unavailable" page

**Modals**
- All modals use `createPortal(…, document.body)` to escape the sticky header's `backdrop-blur` CSS stacking context

**Params in App Router**
- `params` and `searchParams` are `Promise`s in Next.js 16: always `const { id } = await params`

**i18n**
- All UI strings live in `src/lib/i18n/locales/` — locales: `en` (canonical `Translations` type), `ja`, `gu`. Every locale must have every key
- Locale comes from the `locale` cookie: server components use `getServerT()` / `getServerLocale()` from `@/lib/i18n/server`; client components use `useT()`; `setLocaleAction` changes it
- To add a language: copy `en.ts` → `<code>.ts`, add it in `server.ts`, the `localeMap` in `provider.tsx`, and the switcher in `UserMenu.tsx`
- Dynamic strings are typed functions: `welcome: (name: string) => \`Welcome back, ${name}\``
- Note: many newer components (settings sections, gallery components, danger zone) still hardcode English strings

**Plan gating**
- `Subscription.planTier`: `FREE` | `PRO` | `STUDIO`
- Plan prices and storage limits come from the `StripePlan` table (admin-managed at `/admin/plans`); event limits from `getEventLimits()` in `src/lib/platform-settings.ts`
- Some feature gates are code constants: `THEME_ACCESS` / `ANIMATION_ACCESS` (`plans.ts`) and `PLAN_CULLING_LIMITS` (`storage.ts`: FREE off, PRO 500 photos sharpness+blink, STUDIO unlimited all features)
- Storage helpers: `getStorageLimitForTier(tier)` and `formatStorageSize(bytes)` in `src/lib/storage.ts`
- No plans are seeded by default — create them from `/admin/plans` before testing Stripe flows
- BigInt storage values cannot be passed to client components — serialize with `.toString()` or use `formatStorageSize()` server-side
- Client modals that display plan options (`ChangePlanModal`, `ManualOverridePanel`) receive `planOptions` as a serializable prop from their parent server page
- Check `atEventLimit` before showing the create-event button; storage bar shown on dashboard
- ZIP download and watermarking are PRO/STUDIO only; FREE users see an upgrade prompt
- Stripe checkout at `/pricing`; Billing Portal button on `/dashboard/billing`

### Component patterns

- **`PhotoGrid`** (dashboard) and **`Gallery`** (share page): masonry layout, lightbox via `createPortal`
- **Lightbox**: keyboard nav (Escape/←/→), swipe on mobile, body scroll lock, `key={photo.id}` on `<img>` for instant swap, EXIF info panel (`LightboxInfoPanel`)
- **Grid density**: `GridDensityControl`, saved per gallery in `localStorage`, default from the link's `defaultGridDensity`
- Outer image areas use `<div role="button" tabIndex={0}>` instead of `<button>` when they contain interactive children (delete/download buttons), to avoid nested button HTML violation
- **Optimistic cover photo preview**: `URL.createObjectURL(file)` shows instant local preview before S3 upload completes
- **Watermark live preview**: CSS-only (no server round-trip)
- The `qrcode` npm package must not be used client-side (its pngjs browser bundle breaks React 19 prerender); QR codes are generated server-side with `qrcode-generator` + sharp

### Prisma notes

- After editing `schema.prisma`, create a migration and run `prisma generate`
- Older code casts queries (`db.x.update as any`, `select: {...} as any`) or uses `$queryRaw` from before the client was regenerated. The generated client is current — write typed queries in new code

### Environment variables

```
DATABASE_URL
NEXTAUTH_SECRET              # also signs share-page cookies
NEXTAUTH_URL
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
CLOUDFRONT_DOMAIN
CLOUDFRONT_KEY_PAIR_ID
CLOUDFRONT_PRIVATE_KEY       # or CLOUDFRONT_PRIVATE_KEY_PATH (Docker uses /app/private_key.pem)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET        # fallback; the admin-set secret in DB (encrypted) takes precedence
ENCRYPTION_KEY               # 64 hex chars (AES-256-GCM key for lib/encryption.ts)
SES_FROM_EMAIL               # fallback; SES settings can be overridden in PlatformSettings
FACE_SERVICE_URL             # http://face-service:8000 in Docker
FACE_SERVICE_API_KEY
CRON_SECRET                  # x-cron-secret header for /api/cron/*
```

### Tailwind v4 note

Uses `@tailwindcss/postcss`. Configuration is CSS-first (no `tailwind.config.js`); theme customization goes in `src/app/globals.css` under `@theme`. Gallery theme CSS lives in `src/components/gallery/gallery.css`.

### Photo culling pipeline

Culling uses the same Python face service as face indexing. All culling endpoints are prefixed `/cull/` (`analyze`, `embed`, `cluster-bursts`, `analyze-batch`).

**Flow (per photo after upload):**
1. `savePhotoRecord` fires `analyzePhotoForCulling` (fire-and-forget) if `event.cullingEnabled = true`
2. `analyzePhotoForCulling` in `src/lib/cullingService.ts` calls `POST /cull/analyze` + `POST /cull/embed` in parallel, computes `autoSuggestion`, upserts `PhotoCullScore`
3. CLIP embedding stored as `Bytes` in `PhotoCullScore.clipEmbedding` via `embeddingToBuffer()`

**Manual trigger:**
- `triggerManualCulling(eventId)` in `dashboard/events/[id]/actions.ts` — batches 20 photos concurrently, then runs burst clustering
- Burst clustering calls `POST /cull/cluster-bursts`, upserts `BurstCluster` rows, marks `isBestInBurst` on winners
- `getCullingProgress(eventId)` returns the latest `CullingJob` for polling
- Per-photo review actions live in `dashboard/events/[id]/culling/actions.ts`

**Key invariants:**
- `PhotoCullScore` is unique per photo (`@@unique([photoId])`)
- `autoSuggestion` is never written when `photographerOverride = true`
- Burst duplicate auto-suggestion (`"Burst duplicate"`) only applied to non-best photos with `photographerOverride = false`
- `analyzePhotoForCulling` does not own job DONE/FAILED lifecycle — callers manage it
- HTTP client lives in `src/lib/cullClient.ts`; orchestration in `src/lib/cullingService.ts`

### Known gaps

- Event-level watermark override fields are saved but not applied by the download endpoints
- `getPhotoDownloadUrl` in `share/[slug]/actions.ts` returns a direct S3 presigned URL with no watermark or `downloadsEnabled` check; it is unused — use `/api/download/photo/[photoId]` instead
- The `claude-review` GitHub Actions workflow fails immediately on every PR (the `ANTHROPIC_API_KEY` repo secret needs updating); CodeQL is the working CI check
