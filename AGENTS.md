# Project Instructions

## Positioning

MAKE UP is a privacy-first makeup-reference prototype with three browser-local
free successful matches, referral-earned match access, credit-gated AI creator
discovery, and a 9.9 yuan
invitation-only Plus beta. A user selects a front-facing photo,
and the browser measures face-structure proportions locally.
The women flow returns authorized creators and tutorial links. Activated Plus
users can separately consent to send nine disclosed exact ratios and scene/style
choices to DeepSeek for a structured makeup report; Doubao then receives only
the generated text summary and plan highlights for names-only public creator
discovery. The implemented men entertainment-report flow is currently hidden
from the public UI while the product prepares authorized male makeup-creator
matching. Another separately consented AI flow sends a sanitized
photo copy for names-only public creator discovery. It is not identity
recognition, appearance scoring, medical advice, or a professional result guarantee.

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
- The optional men report may send only the nine exact ratios shown to the user,
  the selected fixed tone, and the selected fixed writing style after separate
  consent and Turnstile verification. Do not send the photo, landmarks, identity,
  device/session identifiers, creator data, or local rankings. Do not persist
  ratios, prompts, or generated reports, and label the result as AI-generated.
- Optional AI discovery requires an authenticated account with an available AI
  credit and may send only
  a canvas-reencoded JPEG after separate consent and Turnstile verification. Do
  not persist the photo, AI result, returned creator names, or user ID in AI
  invocation logs; request provider-side conversation storage to be off.
- The first three successful women matches are counted only in the current
  browser; failed analysis and rerunning the same loaded photo do not count.
  Later women matches require referral-earned credits and cannot be purchased.
  A qualified referral means the invited account confirmed its email and
  completed one successful women match. Reward tables may store the two account
  IDs, balances, reason, idempotency UUID, and time, but never photos, face data,
  local rankings, creator names, AI output, payment evidence, or device identity.
- Optional Plus makeup generation requires an active authenticated membership,
  separate consent, and remaining credit; it does not use Turnstile. DeepSeek
  may receive only the nine disclosed ratios, up to three scenes, and one fixed
  makeup direction. Doubao may receive only the generated structural summary,
  plan highlights, scenes, and direction; it must not receive the photo or exact
  ratios. A server-side job may temporarily associate the ratios, configuration,
  generated report, and creator names with the Plus user for less than 24 hours
  so generation can continue after the page closes. Clear exact ratios as soon
  as generation finishes; delete the job after the report is saved to local
  IndexedDB or expires. Reserve one credit atomically when the job is created,
  refund it on failure or expiry, and label generated content and creator names
  as AI-generated and unverified.
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
- Keep the three browser-local successful matches and referral-only continuation
  free of charge. Plus is limited to the current 9.9 yuan
  manual-payment, invitation-only beta. Do not add automatic payments,
  subscriptions, paid ranking, ads, or broader monetization without explicit
  user approval.
- Production audits are read-only by default. Approval, rejection, deletion, or
  Storage changes require explicit user authorization. A direct instruction to
  upload, import, approve, reject, delete, or change Storage is that authorization;
  execute it without asking for a duplicate confirmation, then verify the result.

## Current State

`main` is the authoritative release branch. The public app uses Vercel Analytics,
Supabase for consent-backed creator intake, Cloudflare
Turnstile for submission protection, and manual review before publication.
The result page supports login-free yes/no feedback, local share-poster
generation, separately consented AI names-only discovery using invite-earned or
manually purchased credits, and the 9.9 yuan invitation-only Plus beta. Feedback,
share, and AI telemetry must remain aggregate and must not include user photos,
face proportions, match scores, creator names, AI results, rankings, or account
identifiers.
Read `README.md`, `SUPABASE_SETUP.md`, and `docs/ADMIN_REVIEW.md` before changing
the public data flow or deployment contract.
