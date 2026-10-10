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
docker compose exec -T app npx prisma db seed
docker compose exec -T app npx prisma studio   # GUI on port 5555
```

Maintenance scripts (`tsx`, run in the container): `storage:sync` (recalculate `storageUsedBytes`),
`exif:backfill`, `links:migrate` (backfill `SharedLink.accessType`), `seed:docs` + `screenshots*`
(Puppeteer screenshots for the docs site), `docs:serve` (static docs site in `docs/` on port 4000).
`scripts/setup-s3-cors.ts` applies the bucket CORS policy needed for browser presigned PUTs.

Seed (`prisma/seed.ts`) creates `test@photo.com` (PHOTOGRAPHER, FREE) and `admin@photohouse.com`
(SUPER_ADMIN). Passwords are in the seed file. No plans are seeded.

No test runner is configured.

## AI workflow (.claude/)

Project skills and agents live in `.claude/`. Use them for day-to-day work:
- `/new-feature <request>` — planner → researcher → database-dev → backend-dev → frontend-dev → code-reviewer
- `/debug-fix <bug>` — debugger → fix-checker → code-reviewer
- `/devops [doctor|build|audit|deploy-prep]` — devops agent; outward-facing actions need explicit confirmation
- `/learn <feedback>` — record feedback; agents read `.claude/workflow/learnings/` before every task

See `.claude/workflow/README.md` for the architecture. Shared agent rules are in `.claude/workflow/engineering-rules.md`.

**Git** (full rules in `.claude/workflow/git-rules.md`): never commit to `main`; branches are
`feature/|fix/|docs/|chore/<kebab-name>`; commits are `<type>(<scope>): <summary>`; stage files by
name; commit, push and open PRs only when asked; no force-push or history rewrites.

## Architecture

**PhotoHouse** — a photographer client gallery app built on Next.js App Router with TypeScript and Tailwind CSS v4.

### Stack

- **Next.js 16** App Router (`output: "standalone"`, server actions body limit 50 MB), React 19, TypeScript (strict), Tailwind CSS v4
- **PostgreSQL** via **Prisma 7** with `@prisma/adapter-pg` (AWS RDS in prod, `postgres:16` in docker-compose). Generated client lives at `src/generated/prisma` (import from `@/generated/prisma/client`); config in `prisma.config.ts` (loads `.env.local`)
- **NextAuth v4** — credentials provider, JWT sessions, roles `PHOTOGRAPHER` | `SUPER_ADMIN`. Config in `src/lib/auth.ts`, types extended in `src/types/next-auth.d.ts`
- **AWS S3** (private bucket) + **CloudFront CDN** for photo delivery; **SES** for email (`src/lib/ses.ts`, templates in `src/emails/` via react-email)
- **Stripe** — checkout + billing portal. Webhook handler at `src/app/api/stripe/webhook/route.ts`
- **sharp** — thumbnails (`src/lib/thumbnail.ts`), EXIF (`src/lib/exif.ts`), watermarking (`src/lib/watermark.ts`), QR cards
- **Python face service** (`services/face-service`, FastAPI + InsightFace + open-clip) — face indexing/search/clustering and photo culling. Auth via `X-API-Key: FACE_SERVICE_API_KEY`

docker-compose runs three services: `db` (5432), `face-service` (8000), `app` (3000, `dev` Dockerfile target, runs `migrate deploy` + `generate` + `db seed` on start).

### Folder structure

```
src/
  proxy.ts               # Route guard (Next 16's rename of middleware.ts; exports `proxy`).
                         # / → login|dashboard|admin; auth pages → home if logged in;
                         # /dashboard,/admin → /login if not; /admin → /dashboard?error=access_denied if not SUPER_ADMIN
  app/
    (auth)/              # Login + register (register respects the signups-enabled platform setting)
    dashboard/           # Photographer: event list, stats, storage banner, impersonation banner
    dashboard/events/[id]/            # Event detail: photo grid, upload, cover, Culling tab, People tab
    dashboard/events/[id]/settings/   # Event settings (sections in src/components/settings/)
    dashboard/events/[id]/selections/ # Customer photo selections
    dashboard/events/[id]/shared-links/customise/  # Gallery customisation actions
    dashboard/profile/   # Personal info, studio branding, watermark settings
    dashboard/billing/   # Current plan, Stripe portal
    admin/               # SUPER_ADMIN: photographers (+ impersonation), events, plans, subscriptions,
                         #   storage, platform settings, Stripe webhook config, activity log
    share/[slug]/        # Public customer gallery (PASSWORD | PIN | NONE access, no NextAuth)
    share/[slug]/preview/  # Photographer preview of a gallery
    maintenance/         # Shown when maintenance mode is on (dashboard + share layouts check it)
    pricing/             # Public pricing page with Stripe checkout
    api/auth/                       # NextAuth handler + force-signout (clears stale JWT cookies)
    api/download/[slug]/            # Streaming ZIP for customers (PRO/STUDIO only)
    api/download/photo/[photoId]/   # Single photo download, watermarked on paid plans
    api/download/selection/[selectionId]/  # Photographer ZIP of a customer selection
    api/share-grant/[slug]/         # Sets share cookie for NONE-access links, then redirects
    api/preview/[linkId]/           # Photographer-authenticated: sets share cookie, redirects to gallery
    api/qr/                         # Photographer-only QR code data URL
    api/cron/cleanup-face-sessions/ # Deletes expired FaceSearchSessions + selfies (CRON_SECRET)
    api/stripe/webhook/             # Stripe webhook (secret from StripeWebhookConfig, encrypted)
    api/ping/                       # Health/connectivity ping (used by upload network monitor)
  components/
    gallery/             # Customer gallery UI: GalleryRoot, MasonryGrid, PhotoCard, SelectionBar, ZipModal, …
    settings/            # Event settings sections (SettingsShell + *Section.tsx)
  emails/                # react-email templates
  hooks/                 # useUploadQueue, useTheme, useInfoPanelState
  lib/
    auth.ts, admin.ts    # authOptions, isSuperAdmin(); requireSuperAdmin() for admin actions/routes
    impersonation.ts     # SUPER_ADMIN impersonation via backed-up session cookie
    db.ts                # Prisma client singleton
    s3.ts                # Presigned URL helpers (upload, cover, logo, download, delete) — "use server"
    multipart.ts         # S3 multipart upload actions — "use server"
    uploadManager.ts / uploadEngine.ts / uploadQueue.ts / retryEngine.ts /
      concurrencyController.ts / networkMonitor.ts   # Client-side resumable upload pipeline
    cloudfront.ts        # getCloudfrontSignedUrl() / getCloudfrontPreviewUrl(); urlCache.ts caches signed URLs
    thumbnail.ts, exif.ts, watermark.ts             # sharp processing
    share-token.ts       # HMAC-SHA256 signed tokens for share page cookie auth
    pin.ts               # Secure PIN generation for PIN-access links
    encryption.ts        # encrypt/decrypt (ENCRYPTION_KEY) for secrets stored in DB
    platform-settings.ts # PlatformSettings key/value store: maintenance, signups, limits, SES, support email
    plans.ts             # Theme/animation access per tier
    storage.ts           # Storage limits/usage, culling limits per tier
    stripe.ts, ses.ts    # Clients
    faceService.ts, faceIndexing.ts, embedding.ts   # Face recognition client + orchestration
    cullClient.ts, cullingService.ts                # Culling client + orchestration
    gallery-theme.ts, theme.ts                      # Gallery themes; app light/dark theme
    qrGenerator.ts, qrCardGenerator.ts              # Server-only QR generation (qrcode-generator + sharp)
    i18n/                # see i18n below
```

### Key architectural decisions

**S3 key structure**
- Event photos: `photographers/{userId}/events/{eventId}/{timestamp}-{filename}` (multipart uploads use `{uuid}-{filename}`)
- Thumbnails: derived from the photo key via `thumbKeyFor(s3Key)`, stored in `Photo.thumbS3Key`
- Cover photos: `photographers/{userId}/events/{eventId}/cover/{timestamp}-{filename}`
- Studio logos: `branding/{userId}/logo/{timestamp}-{filename}`
- Customer selfies (face search): `selfies/{slug}/{uuid}.{ext}` — removed by the cleanup cron
- QR cards: `qr-cards/{sharedLinkId}.png` and `qr-cards/{sharedLinkId}-a4.png`

**Uploads**
- Browser uploads directly to S3 via presigned URLs (single PUT or multipart for large files) — bucket CORS must allow it
- Client pipeline: `UploadManager` (singleton via `getUploadManager()`) drives an IndexedDB-backed queue (`uploadQueue.ts`), retries with backoff (`retryEngine.ts`), adapts concurrency to measured speed, and pauses/resumes on offline/online (`networkMonitor.ts`)
- UI notifications are decoupled: the manager dispatches `photohouse:toast` CustomEvents on `window`
- After upload, `savePhotoRecord` (server action) creates the thumbnail, extracts EXIF, increments `storageUsedBytes`, and fires culling (if `cullingEnabled && autoCullOnUpload`)

**Photo delivery flow**
- All photos served via CloudFront signed URLs (1 h expiry, cached 10 min in-process) — never direct S3 URLs
- The s3Key is never passed to client components — server generates signed URLs and passes those
- CloudFront private key: `CLOUDFRONT_PRIVATE_KEY_PATH` (file) or `CLOUDFRONT_PRIVATE_KEY` (escaped PEM or base64)
- All downloads route through server endpoints (never direct S3/CloudFront URLs):
  - Single photo: `GET /api/download/photo/[photoId]?slug={slug}`
  - Full ZIP: `GET /api/download/[slug]` (PRO/STUDIO only, and the link must have `downloadsEnabled` + `zipDownloadEnabled`)
  - Selection ZIP (photographer): `GET /api/download/selection/[selectionId]`
- Customer download endpoints verify the `share_{slug}` cookie before serving anything

**Share page auth**
- No NextAuth session required for the public gallery
- `SharedLink.accessType`: `PASSWORD` (bcrypt `passwordHash`), `PIN` (bcrypt `pin`; `pinPlain` kept for photographer recovery), or `NONE`
- On correct password/PIN: server sets an httpOnly cookie `share_{slug}` (path `/`, 24 h) containing an HMAC-signed token (`slug|exp|hmac`)
- NONE links redirect through `/api/share-grant/[slug]` (server components can't set cookies); photographer previews go through `/api/preview/[linkId]`
- Tokens are signed with `NEXTAUTH_SECRET`. `verifyShareToken()` in `src/lib/share-token.ts` uses `timingSafeEqual` to prevent timing attacks
- Brute-force protection: 5 attempts per slug+IP per 15 min, recorded in `GalleryAccessAttempt`
- Cookie path must be `/` (not `/share/{slug}`) so it is sent with requests to `/api/download/…`
- Links can expire (`expiresAt`); suspended photographers' galleries show an unavailable message; share layout honours maintenance mode
- Page re-renders after `router.refresh()` and shows gallery if cookie is valid

**Customer gallery**
- `/share/[slug]` renders `GalleryRoot` + `src/components/gallery/*`. Per-link options: downloads, ZIP, selection, face search, grid density, group visibility overrides
- Event-level customisation: theme (`minimal | dark | cinematic | warm | custom`, custom tokens in `Event.customThemeData`), welcome screen (message + hero photo), intro animation (`none | fade | reveal | typewriter | filmstrip`), title/subtitle, photo count/date visibility. Theme resolution in `src/lib/gallery-theme.ts`
- Customers can submit a **photo selection** (name, email, per-photo notes) → `PhotoSelection` + `SelectedPhoto`, sets `Event.hasNewSelections`, emails the photographer via SES
- Studio branding: `StudioProfile` (`studioName`, `logoS3Key`, `tagline`, `website`, `phone`, `address`, `brandColor`). Background precedence: event cover photo → brand color → dark zinc gradient

**Watermarking**
- Logic lives in `src/lib/watermark.ts` using `sharp`
- Only applied on PRO and STUDIO plans — FREE plan downloads are never watermarked
- Profile defaults on `StudioProfile`: `watermarkEnabled`, `watermarkPosition` (`BOTTOM_RIGHT` | `BOTTOM_LEFT` | `BOTTOM_CENTER`), `watermarkOpacity` (10–80)
- Per-event override on `Event` when `watermarkOverride = true`: `watermarkEnabled`, `watermarkSource` (`logo` | `name` | `none`), `watermarkPosition`, `watermarkOpacity`
- If a logo is used, it is fetched from S3, resized to 8% of image width, and composited; falls back to SVG text watermark if logo fetch fails
- Photographers configure watermark settings at `/dashboard/profile` and in event settings, with a live CSS preview

**Face recognition**
- Opt-in per event (`Event.faceIndexingEnabled`). Faces indexed via the face service (`/index`), embeddings stored as `Bytes` (`FaceRecord`), clustered into `FaceCluster`s (`/cluster`) shown in the People tab; jobs tracked in `FaceIndexingJob`
- Customers can "find my photos" with a selfie when the link has `faceSearchEnabled` → `FaceSearchSession` (24 h expiry, cleaned by cron)
- Event face data can be deleted (`faceDataDeletedAt`)

**Admin & platform**
- `/admin/*` is SUPER_ADMIN only (enforced in `proxy.ts` and via `requireSuperAdmin()` in every admin action/route); admin actions are logged to `AdminActivityLog`
- Impersonation: admin's session cookie is backed up to `admin_session_backup`, a target-user JWT is minted; exit restores it
- Users can be suspended (`isSuspended`, `suspendedReason`) — login is refused with the reason
- `PlatformSettings` (key/value, `src/lib/platform-settings.ts`): maintenance mode, signups enabled, plan storage/event limits, SES credentials, support email
- Stripe webhook secret is stored encrypted in `StripeWebhookConfig`; every webhook is recorded in `WebhookLog`

**Modals**
- All modals use `createPortal(…, document.body)` to escape the sticky header's `backdrop-blur` CSS stacking context

**Params in App Router**
- `params` and `searchParams` are `Promise`s in Next.js 16: always `const { id } = await params`

**i18n**
- Locales: `en` (canonical), `ja`, `gu` in `src/lib/i18n/locales/`. `Translations = typeof en`; every locale is typed as `Translations`, so **new keys must be added to all three files** or type-check fails
- Locale is per user, stored in the `locale` cookie (`setLocaleAction` in `src/lib/i18n/actions.ts`, switcher in `UserMenu.tsx`)
- Server components: `const t = await getServerT()` (`@/lib/i18n/server`). Client components: `const t = useT()` (`@/lib/i18n`, provided by `LocaleProvider` in `src/app/providers.tsx`)
- Never hardcode UI text in components
- Dynamic strings are typed functions: `welcome: (name: string) => \`Welcome back, ${name}\``
- To add a language: copy `en.ts` → `<code>.ts`, add it to `localeMap` in `provider.tsx`, `SUPPORTED`/`getServerT` in `server.ts`, and the switcher in `UserMenu.tsx`

**Plan gating**
- `Subscription.planTier`: `FREE` | `PRO` | `STUDIO`
- **DB-driven** (never hardcode): plan prices, storage limits, and event limits
  - Storage: `getStorageLimitForTier(tier)` reads the active `StripePlan` row (code fallback only if none exists); `formatStorageSize(bytes)` in `src/lib/storage.ts`
  - Event limits: `getEventLimits()` in `src/lib/platform-settings.ts`
  - Plans are admin-managed at `/admin/plans`; none are seeded — create them before testing Stripe flows
- **Code constants** (use the helpers, don't duplicate inline): culling access per tier (`getCullingLimits()` in `storage.ts` — FREE none, PRO 500 photos sharpness+blink, STUDIO unlimited + aesthetic+burst); gallery theme/animation access (`canUseTheme()` / `canUseAnimation()` in `plans.ts`)
- BigInt storage values cannot be passed to client components — serialize with `.toString()` or use `formatStorageSize()` server-side
- Client modals that display plan options (`ChangePlanModal`, `ManualOverridePanel`) receive `planOptions` as a serializable prop from their parent server page
- Check `atEventLimit` before showing the create-event button; storage bar shown on dashboard
- ZIP download and watermarking are PRO/STUDIO only; FREE users see an upgrade prompt
- Stripe checkout at `/pricing`; Billing Portal button on `/dashboard/billing`

### Component patterns

- **`PhotoGrid`** (dashboard) and **`MasonryGrid`** (share gallery): JS masonry — items are distributed to the shortest of N columns (N from grid density via `useColumnCount`), lightbox via `createPortal`
- **Lightbox**: keyboard nav (Escape/←/→), body scroll lock, `key={photo.id}` on `<img>` for instant swap; EXIF in `LightboxInfoPanel`
- Outer image areas use `<div role="button" tabIndex={0}>` instead of `<button>` when they contain interactive children (delete/download buttons), to avoid nested button HTML violation
- **Optimistic cover photo preview**: `URL.createObjectURL(file)` shows instant local preview before S3 upload completes
- **Watermark live preview**: CSS-only (no server round-trip) — gradient placeholder + absolutely-positioned studio name/logo at chosen position/opacity, updates as sliders change
- **Server-only QR**: QR generation stays server-side (`qrcode-generator` + sharp); the `qrcode` package was removed because its browser bundle broke the Next 16 `/_global-error` prerender

### Environment variables required

```
DATABASE_URL
NEXTAUTH_SECRET            # also signs share-page tokens
NEXTAUTH_URL
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
CLOUDFRONT_DOMAIN
CLOUDFRONT_KEY_PAIR_ID
CLOUDFRONT_PRIVATE_KEY     # or CLOUDFRONT_PRIVATE_KEY_PATH (docker-compose uses /app/private_key.pem)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET      # fallback; normally stored encrypted in StripeWebhookConfig
ENCRYPTION_KEY             # encrypts secrets stored in the DB
FACE_SERVICE_URL           # http://face-service:8000 in docker-compose
FACE_SERVICE_API_KEY       # shared with services/face-service
CRON_SECRET                # protects /api/cron/*
SES_FROM_EMAIL             # fallback; SES settings normally come from PlatformSettings
```

Optional: `DOCS_BASE_URL`, `PUPPETEER_EXECUTABLE_PATH` (screenshot scripts).

### Tailwind v4 note

Uses `@tailwindcss/postcss`. Configuration is CSS-first (no `tailwind.config.js`); theme customization goes in `src/app/globals.css` under `@theme`.

### Photo culling pipeline

Culling uses the same Python face service as face indexing. All culling endpoints are prefixed `/cull/` (`analyze`, `embed`, `analyze-batch`, `cluster-bursts`).

**Flow (per photo after upload):**
1. `savePhotoRecord` fires `analyzePhotoForCulling` (fire-and-forget) if `event.cullingEnabled && event.autoCullOnUpload`
2. `analyzePhotoForCulling` in `src/lib/cullingService.ts` calls `POST /cull/analyze` + `POST /cull/embed` in parallel, computes `autoSuggestion`, upserts `PhotoCullScore`
3. CLIP embedding stored as `Bytes` in `PhotoCullScore.clipEmbedding` via `embeddingToBuffer()`

**Manual trigger:**
- `triggerManualCulling(eventId)` in `dashboard/events/[id]/actions.ts` — batches 20 photos concurrently, then runs burst clustering
- Burst clustering calls `POST /cull/cluster-bursts`, upserts `BurstCluster` rows, marks `isBestInBurst` on winners
- `getCullingProgress(eventId)` returns the latest `CullingJob` for polling
- Per-event settings: `cullingSensitivity` (`low | medium | high`), `rejectBurstDups`

**Key invariants:**
- `PhotoCullScore` is unique per photo (`@@unique([photoId])`)
- `autoSuggestion` is never written when `photographerOverride = true`
- Burst duplicate auto-suggestion (`"Burst duplicate"`) only applied to non-best photos with `photographerOverride = false`
- `analyzePhotoForCulling` does not own job DONE/FAILED lifecycle — callers manage it
- HTTP client lives in `src/lib/cullClient.ts`; orchestration in `src/lib/cullingService.ts`
