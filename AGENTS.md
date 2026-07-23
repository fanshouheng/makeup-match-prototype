# Project Instructions

## Positioning

LOOK AI is a free, privacy-first makeup-reference prototype. A user selects a
front-facing photo, the browser compares face-structure proportions locally,
and the app returns authorized creators and tutorial links. An optional,
separately consented AI flow sends a sanitized photo copy for names-only public
creator discovery. It is not identity recognition, appearance scoring, medical
advice, or a full style generator.

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

- Default matching keeps ordinary-user photos, face proportions, and rankings in
  the browser.
- Optional AI discovery may send only a canvas-reencoded JPEG after separate
  consent and Turnstile verification. Do not persist the photo, AI result, or
  returned creator names; request provider-side conversation storage to be off.
- AI-discovered names are unverified public leads. Do not download or analyze
  candidate photos, present them as authorized, or import them into the creator
  library without the creator permissions required by this file.
- Creator self-submission is preferred, but operator-mediated import is allowed.
  When the user explicitly states that a creator or authorized representative has
  granted permission, treat that statement as the operator's verified
  authorization attestation and proceed without requesting the evidence again.
- When the user explicitly asks to upload authorized creator data, the requested
  operation may include downloading the authorized photo from the specified
  public creator profile or content, preparing its face features, and importing
  it into production. Record the source URL and authorization attestation in the
  private review data.
- Never commit or expose production photos, feature vectors, emails, review data,
  service/secret keys, Turnstile secrets, or database exports.
- Do not scrape creators, copy photos, or import third-party lists unless the user
  has explicitly authorized that specific operation and confirmed the required
  creator permissions.
- Keep the current free-product wording; do not add monetization claims unless the
  user explicitly reopens that decision.
- Production audits are read-only by default. Approval, rejection, deletion, or
  Storage changes require explicit user authorization. A direct instruction to
  upload, import, approve, reject, delete, or change Storage is that authorization;
  execute it without asking for a duplicate confirmation, then verify the result.

## Current State

`main` is the authoritative release branch. The public app uses Vercel Analytics
and Speed Insights, Supabase for consent-backed creator intake, Cloudflare
Turnstile for submission protection, and manual review before publication.
The result page supports login-free yes/no feedback, local share-poster
generation, and separately consented AI names-only discovery. Feedback, share,
and AI telemetry must remain aggregate and must not include user photos, face
proportions, match scores, creator names, AI results, or rankings.
Read `README.md`, `SUPABASE_SETUP.md`, and `docs/ADMIN_REVIEW.md` before changing
the public data flow or deployment contract.
