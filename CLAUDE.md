# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Build for production
npm run lint     # Run ESLint
```

No test runner is configured.

## Architecture

**PhotoShare** — a photographer client gallery app built on Next.js App Router with TypeScript and Tailwind CSS v4.

### Stack

- **Next.js 16** App Router, TypeScript (strict), Tailwind CSS v4
- **PostgreSQL** via **Prisma 7** with `@prisma/adapter-pg` (AWS RDS). Generated client lives at `src/generated/prisma` (not the default `node_modules/.prisma`)
- **NextAuth v4** — credentials provider, JWT sessions. Config in `src/lib/auth.ts`, types extended in `src/types/next-auth.d.ts`
- **AWS S3** (private bucket) + **CloudFront CDN** for photo delivery
- **Stripe** — checkout + billing portal wired up. Webhook handler at `src/app/api/stripe/webhook/route.ts`
- **sharp** — server-side watermarking via `src/lib/watermark.ts`

### Folder structure

```
src/
  app/
    (auth)/              # Login + register pages (route group, no shared layout header)
    dashboard/           # Photographer-only: event list, stats, create event
    dashboard/events/[id]/   # Event detail: photo grid, upload, share, cover photo
    dashboard/profile/   # Personal info, studio branding, watermark settings
    dashboard/billing/   # Current plan, Stripe portal
    share/[slug]/        # Public customer gallery (password-gated, no NextAuth)
    api/auth/            # NextAuth route handler
    api/download/[slug]/ # Streaming ZIP download endpoint (PRO/STUDIO only)
    api/download/photo/[photoId]/  # Single photo download with watermark
    api/stripe/webhook/  # Stripe webhook handler
    pricing/             # Public pricing page with Stripe checkout
  lib/
    auth.ts         # NextAuth authOptions
    db.ts           # Prisma client singleton
    s3.ts           # Presigned URL helpers (upload, cover upload, download, delete)
    cloudfront.ts   # getCloudfrontSignedUrl() for serving photos via CDN
    share-token.ts  # HMAC-SHA256 signed tokens for share page cookie auth
    stripe.ts       # Stripe client singleton
    watermark.ts    # sharp-based watermark compositing (text or logo, position, opacity)
    i18n/
      index.ts              # exports `t = en` — swap to change locale globally
      locales/en.ts         # All UI strings; add new locale files here
  middleware.ts     # Redirects: logged-in → /dashboard, unauthenticated → /login
```

### Key architectural decisions

**S3 key structure**
- Event photos: `photographers/{userId}/events/{eventId}/{timestamp}-{filename}`
- Cover photos: `photographers/{userId}/events/{eventId}/cover/{timestamp}-{filename}`

**Photo delivery flow**
- All photos served via CloudFront signed URLs — never direct S3 URLs
- The s3Key is never passed to client components — server generates signed URLs and passes those
- All downloads route through server endpoints (never direct S3/CloudFront URLs):
  - Single photo: `GET /api/download/photo/[photoId]?slug={slug}`
  - Full ZIP: `GET /api/download/[slug]` (PRO/STUDIO only)
- Both endpoints verify the `share_{slug}` cookie before serving anything

**Share page auth**
- No NextAuth session required for the public gallery
- On correct password: server sets an httpOnly cookie `share_{slug}` (path `/`) containing an HMAC-signed token (`slug|exp|hmac`)
- `verifyShareToken()` in `src/lib/share-token.ts` uses `timingSafeEqual` to prevent timing attacks
- Cookie path must be `/` (not `/share/{slug}`) so it is sent with requests to `/api/download/…`
- Page re-renders after `router.refresh()` and shows gallery if cookie is valid

**Studio branding on share pages**
- `StudioProfile` stores: `studioName`, `logoS3Key`, `tagline`, `website`, `phone`, `address`, `brandColor`
- `/share/[slug]` fetches the photographer's `studioProfile` and renders a glassmorphism hero header
- Background precedence: event cover photo → brand color → dark zinc gradient
- Logo, studio name, and event metadata are shown inside a glass card over the hero

**Watermarking**
- Logic lives in `src/lib/watermark.ts` using `sharp`
- Only applied on PRO and STUDIO plans — FREE plan downloads are never watermarked
- `StudioProfile` stores watermark preferences: `watermarkEnabled` (bool), `watermarkPosition` (`BOTTOM_RIGHT` | `BOTTOM_LEFT` | `BOTTOM_CENTER`), `watermarkOpacity` (int 10–80)
- If `logoS3Key` is set, logo is fetched from S3, resized to 8% of image width, and composited at the chosen position; falls back to SVG text watermark if logo fetch fails
- Text watermark is a full-size transparent SVG with drop-shadow filter
- Photographers configure watermark settings at `/dashboard/profile` with a live CSS preview

**Modals**
- All modals use `createPortal(…, document.body)` to escape the sticky header's `backdrop-blur` CSS stacking context

**Params in App Router**
- `params` is a `Promise` in Next.js 16: always `const { id } = await params`

**i18n**
- All UI strings live in `src/lib/i18n/locales/en.ts` — never hardcode text in components
- To add a language: copy `en.ts` → `<code>.ts`, import it in `index.ts`, swap `export const t = en`
- Dynamic strings are typed functions: `welcome: (name: string) => \`Welcome back, ${name}\``

**Plan gating**
- `Subscription.planTier`: `FREE` (3 events, 1 GB) | `PRO` (25 events, 50 GB) | `STUDIO` (unlimited, 500 GB)
- Check `atEventLimit` before showing the create-event button; storage bar shown on dashboard
- ZIP download and watermarking are PRO/STUDIO only; FREE users see an upgrade prompt
- Stripe checkout at `/pricing`; Billing Portal button on `/dashboard/billing`

### Component patterns

- **`PhotoGrid`** (dashboard) and **`Gallery`** (share page): masonry layout using CSS `columns`, lightbox via `createPortal`
- **Lightbox**: keyboard nav (Escape/←/→), body scroll lock, `key={photo.id}` on `<img>` for instant swap
- Outer image areas use `<div role="button" tabIndex={0}>` instead of `<button>` when they contain interactive children (delete/download buttons), to avoid nested button HTML violation
- **Optimistic cover photo preview**: `URL.createObjectURL(file)` shows instant local preview before S3 upload completes
- **Watermark live preview**: CSS-only (no server round-trip) — gradient placeholder + absolutely-positioned studio name/logo at chosen position/opacity, updates as sliders change

### Environment variables required

```
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
CLOUDFRONT_URL
CLOUDFRONT_KEY_PAIR_ID
CLOUDFRONT_PRIVATE_KEY
SHARE_TOKEN_SECRET
```

### Tailwind v4 note

Uses `@tailwindcss/postcss`. Configuration is CSS-first (no `tailwind.config.js`); theme customization goes in `src/app/globals.css` under `@theme`.
