// Vercel edge function — calls Claude vision to extract sticker statuses from an image.
// Env var required: ANTHROPIC_API_KEY  (set in Vercel project settings)
// Request body: { mode: 'album' | 'doubles', country?: string, imageBase64: string, mimeType: string }
// Response:     { mode, country, stickers: [{slot|last, status}], raw }

export const config = { runtime: 'edge' };

const MODEL = 'claude-opus-4-8';
const ALLOWED_STATUS = ['have', 'missing', 'double'];

// Long, STABLE instruction text — kept identical between requests so prompt caching hits.
const ALBUM_SYSTEM = `You are reading a photo of a Panini FIFA World Cup 2026 sticker album page.

The page layout is:
- A team BADGE slot (top-left or in the header), labeled "B".
- Numbered player slots, typically 1 through 11 (sometimes 0 through 10 for some teams).
- The team name or country name is visible somewhere on the page.

FIRST: detect and return the country name (e.g. "France", "Argentina", "Brazil").

Then, for EACH slot in the layout, decide its status:
- "have"    = sticker is physically pasted in the slot (a player photo is visible inside the slot border).
- "missing" = slot is EMPTY (just the big number/letter shown, no sticker pasted).
- "double"  = sticker is pasted AND has a small red/pink star marker on top (rare on album pages).

Return ONLY valid JSON, no prose. Format:
{"country":"France","stickers":[{"slot":"B","status":"have"},{"slot":"1","status":"missing"},{"slot":"2","status":"have"}]}

Include every slot you can see on the page. Use "B" for the badge, otherwise the slot number as a string.
If you cannot determine a slot with confidence, omit it rather than guessing.`;

const DOUBLES_SYSTEM = `You are reading a photo of Panini FIFA World Cup 2026 stickers. The photo may show a pile, a spread, individual stickers, or any format — always stickers.

For each clearly visible sticker, identify:
- The player's LAST NAME (printed at the bottom in bold capitals).
- The player's FIRST NAME if readable.
- The COUNTRY (from the flag, jersey, or text visible on the sticker).
- Whether there is a small pink/magenta STAR marker positioned above or on top of the sticker:
    - star present  -> "have"   (newly acquired sticker; was missing, now owned)
    - no star       -> "double" (duplicate copy already owned)
- The CLUB if readable (small text under the player name).

The star is a physical pink/magenta sticker marker placed by the collector. Look carefully — it sits above the sticker card, not printed on it.

Return ONLY valid JSON, no prose. Format:
{"stickers":[{"last":"DJIKU","first":"Alexander","country":"Ghana","club":"Spartak Moskva","status":"double"},{"last":"MAIGNAN","first":"Mike","country":"France","status":"have"}]}

For team badges (no player photo, just the federation logo), use last:"BADGE".
Include every clearly visible sticker. Skip stickers that are partially cut off or unreadable.
Country must be one of: Mexico, South Africa, Korea Republic, Czechia, Canada, Bosnia, Qatar, Switzerland, Brazil, Morocco, Haiti, Scotland, USA, Paraguay, Australia, Turkey, Germany, Curazao, Cote d Ivoire, Ecuador, Netherlands, Japan, Sweden, Tunisia, Belgium, Egypt, Iran, New Zealand, Spain, Cabo Verde, Saudi Arabia, Uruguay, France, Senegal, Iraq, Norway, Argentina, Algeria, Austria, Jordan, Portugal, Congo DR, Uzbekistan, Colombia, England, Croatia, Ghana, Panama.`;

function j(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return j({ error: 'Server not configured: ANTHROPIC_API_KEY missing' }, 500);

  let body;
  try { body = await req.json(); }
  catch (e) { return j({ error: 'Invalid JSON' }, 400); }

  const { mode, country, imageBase64, mimeType } = body;
  if (!mode || !imageBase64 || !mimeType) return j({ error: 'Missing mode / imageBase64 / mimeType' }, 400);
  if (!['album', 'doubles'].includes(mode)) return j({ error: 'mode must be "album" or "doubles"' }, 400);
  if (imageBase64.length > 8_000_000) return j({ error: 'Image too large (>6MB). Please resize.' }, 413);

  const systemText = mode === 'album' ? ALBUM_SYSTEM : DOUBLES_SYSTEM;

  const anthropicBody = {
    model: MODEL,
    max_tokens: 4096,
    temperature: 0,
    // Stable instructions in a cached system block -> repeated scans are cheaper.
    system: [
      { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: mode === 'album'
              ? 'Read this album page and return the JSON described.'
              : 'Read these stickers and return the JSON described.' }
        ]
      },
      // Prefill the assistant turn with "{" to force JSON output.
      { role: 'assistant', content: '{' }
    ]
  };

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(anthropicBody)
    });
  } catch (e) {
    return j({ error: 'Claude fetch failed: ' + e.message }, 502);
  }

  if (!resp.ok) {
    const txt = await resp.text();
    return j({ error: 'Claude error', detail: txt.slice(0, 400) }, 502);
  }

  const json = await resp.json();
  // Concatenate text blocks; prepend the "{" prefill that the API does not echo back.
  const out = Array.isArray(json?.content)
    ? json.content.filter(b => b.type === 'text').map(b => b.text).join('')
    : '';
  const text = '{' + out;

  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { return j({ error: 'Claude returned non-JSON', raw: text.slice(0, 500) }, 502); }

  const stickers = Array.isArray(parsed?.stickers) ? parsed.stickers : [];
  const cleaned = stickers
    .filter(s => s && typeof s === 'object' && ALLOWED_STATUS.includes(s.status))
    .slice(0, 200);

  const detectedCountry = mode === 'album'
    ? (parsed?.country || country)
    : (country || parsed?.country);

  return j({ mode, country: detectedCountry || null, stickers: cleaned, raw: text });
}
