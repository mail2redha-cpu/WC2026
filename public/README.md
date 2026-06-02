# FIFA WC 2026 — Panini Swap Tracker (with AI photo upload)

A web app for 3–5 collectors to track Panini sticker collections and find swaps in real time. Hosted free on Vercel, data lives in your free Supabase project, optional AI photo upload via your Gemini API key.

## What's inside

| File | Purpose |
|---|---|
| `index.html` | The entire app — single file, no build step |
| `api/extract.js` | Vercel serverless function that calls Gemini for photo extraction |
| `vercel.json` | Tells Vercel how to deploy the serverless function |
| `schema.sql` | One-time database setup for Supabase |

## Setup — 3 steps, ~10 minutes total

### Step 1: Database (1 min)
1. Open https://supabase.com/dashboard → your project
2. Left sidebar → **SQL Editor** → "+ New query"
3. Paste the entire contents of `schema.sql` → click **Run**
4. You'll see "Success" — 5 player slots are now in the database

### Step 2: Get a Gemini API key (2 min)
1. Open https://aistudio.google.com/apikey
2. Sign in with Google → **Create API key** → pick "Create API key in new project"
3. Copy the key (starts with `AIza...`)
4. Keep this tab open — you'll paste it into Vercel in step 3

Gemini free tier gives you 15 requests/minute and 1500/day — more than enough for a collector group.

### Step 3: Deploy to Vercel (5 min)
Two ways depending on how you prefer to work:

**A) GitHub method** (recommended — gives you a stable URL + auto-deploys on changes):
1. Create a new GitHub repo (any name, public or private)
2. Drag `index.html`, `api/extract.js`, `vercel.json`, `schema.sql`, `README.md` into the repo
3. Go to https://vercel.com → sign in with GitHub → **Add New… → Project**
4. Pick your repo → click **Deploy**
5. **IMPORTANT**: After first deploy, go to project **Settings → Environment Variables**
   - Name: `GEMINI_API_KEY`
   - Value: paste your Gemini key
   - Apply to: Production, Preview, Development
6. Trigger a redeploy: **Deployments** tab → ⋯ on the latest deploy → **Redeploy**
7. You get a permanent URL like `https://panini-swaps.vercel.app`

**B) Vercel CLI method** (no GitHub needed):
```bash
npm i -g vercel
cd panini-package
vercel        # follow prompts, accept defaults
vercel env add GEMINI_API_KEY production    # paste key when prompted
vercel --prod
```

Bookmark the URL, share with friends.

## Using the app

- **Splash** → tap your name to log in
- **Edit mode** → tap ✎ Edit, then tap any sticker to cycle have → double → missing
- **📷 Scan album page** → in edit mode, pick a country and upload a photo of that album page. Gemini reads which slots are pasted (have) vs empty (missing), shows you a preview, you confirm.
- **📷 Scan doubles pile** → photograph your loose doubles pile. Gemini identifies each sticker, detects the pink star = double / no star = have. Review and apply.
- **Swaps** → top panel shows pending trades with anyone in the group. Tap ✓ Traded to mark exchanged.
- **Country filter** → jump to any country in album page order
- **Status filters** → Missing / Doubles / Have / Swaps

## Admin

Add `?admin=1` to your URL (`https://your-app.vercel.app/?admin=1`).

- Rename players (Friend 1 → real name)
- Change emojis  
- Reset traded-swap history (re-show all past swaps)
- Wipe all data (nuclear option)

## Data ownership

Your data lives in your own Supabase project. Export anytime: Supabase dashboard → Table Editor → table → ⋯ → Export CSV.

## Costs

All free. Vercel free tier handles this easily. Supabase free tier (500MB) is overkill. Gemini free tier is more than enough for occasional photo uploads.

## Troubleshooting

- **"Server not configured: GEMINI_API_KEY missing"** → you forgot to set the env var, or you set it but didn't redeploy. Vercel → Settings → Environment Variables → check it's there, then Deployments → Redeploy.
- **"Gemini returned non-JSON"** → photo was too blurry or the layout wasn't clear. Try a closer/cleaner photo.
- **"Nothing detected"** → same — clarity/lighting issue. The AI does best with the whole page visible and reasonable resolution.
- **Photo upload says "Image too large"** → the client should auto-resize to 1600px wide, but if a very large image still fails, resize first.
- **Stickers don't sync across devices** → Supabase dashboard → Database → Replication → ensure realtime is on for `sticker_status`, `swaps_done`, `players`.
- **App still works, AI button doesn't** → app works fine without the AI feature; the upload buttons just need the env var + redeploy to work.

## Security notes

- The Supabase anon key is in the HTML — that's by design, it's a public client-side key. Row-level security in the database controls what it can do.
- The Gemini key lives only on the Vercel server (env var), never in the browser. Friends can use the upload feature without ever seeing your key.
- Each player is trusted to only edit their own list. For 3–5 friends this is fine. If you want PIN protection later, ask.
