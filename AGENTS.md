# Project Instructions

## Positioning

LOOK AI is a free, privacy-first makeup-reference prototype. A user selects a
front-facing photo, the browser compares face-structure proportions locally,
and the app returns authorized creators and tutorial links. It is not identity
recognition, appearance scoring, medical advice, or a full style generator.

- Production: https://makeup.soul.xn--fiqs8s/
- Source: https://github.com/fanshouheng/makeup-match-prototype
- Current priorities: `ROADMAP.md`

## Commands

Use Node.js 20.19 or newer in the 20.x line, or Node.js 22.12 or newer.

```powershell
npm install
npm run dev
npm test
npm run build
```

## Stack And Layout

- `src/`: React 19, TypeScript, MediaPipe analysis, matching, and UI.
- `supabase/`: public creator-library migrations and the submission Edge Function.
- `docs/ADMIN_REVIEW.md`: manual approval, rejection, withdrawal, and deletion SOP.
- `public/`: shipped fonts, model assets, branding, and contact assets.
- `output/` and `.playwright-cli/`: ignored local evidence; inspect before deleting.

## Non-Negotiable Boundaries

- Ordinary-user photos, face proportions, and rankings stay in the browser.
- Only independently submitted and verified creator data may enter production.
- Never commit or expose production photos, feature vectors, emails, review data,
  service/secret keys, Turnstile secrets, or database exports.
- Do not scrape creators or copy photos, lists, or alleged third-party consent.
- Keep the current free-product wording; do not add monetization claims unless the
  user explicitly reopens that decision.
- Production audits are read-only by default. Approval, rejection, deletion, or
  Storage changes require explicit user authorization.

## Current State

`main` is the authoritative release branch. The public app uses Vercel Analytics
and Speed Insights, Supabase for consent-backed creator intake, Cloudflare
Turnstile for submission protection, and manual review before publication.
Read `README.md`, `SUPABASE_SETUP.md`, and `docs/ADMIN_REVIEW.md` before changing
the public data flow or deployment contract.
