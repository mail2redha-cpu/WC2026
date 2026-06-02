// Vercel serverless function — calls Gemini to extract sticker statuses from an image.
// Env var required: GEMINI_API_KEY  (set in Vercel project settings)
// Request body: { mode: 'album' | 'doubles', country?: string, imageBase64: string, mimeType: string }
// Response:     { stickers: [{slot|name, status}], raw: '...' }

export const config = { runtime: 'edge' };

const MODEL = 'gemini-2.5-flash';
const ALLOWED_STATUS = ['have', 'missing', 'double'];

function albumPrompt(country) {
  return `You are reading a Panini FIFA WC 2026 album page.

The page layout is:
- A team BADGE slot (top-left or in the header), labeled "B"
- Numbered player slots, typically 1 through 11 (sometimes 0 through 10 for some teams)
- The team name or country name is visible somewhere on the page

FIRST: Detect and return the country name (e.g., "France", "Argentina", "Brazil").

Then, for EACH slot in the layout, decide its status:
- "have"   = sticker is physically pasted in the slot (player photo visible inside the slot border)
- "missing" = slot is EMPTY (just the big number/letter shown, no sticker pasted)
- "double" = sticker is pasted AND has a small red star marker on top (rare on album pages)

Return ONLY valid JSON, no prose. Format:
{"country":"France","stickers":[{"slot":"B","status":"have"},{"slot":"1","status":"missing"},{"slot":"2","status":"have"}, ...]}

Include every slot you can see on the page. Use "B" for the badge, otherwise the slot number as a string.
If you cannot determine a slot with confidence, omit it rather than guessing.`;
}

function doublesPrompt() {
  return `You are reading a photo of Panini FIFA WC 2026 stickers. The photo may show a pile, a spread, individual stickers, or any format — always stickers.

For each clearly visible sticker, identify:
- The player's LAST NAME (printed at bottom in bold capitals)
- The COUNTRY (from the flag, jersey, or text visible on the sticker)
- Whether there is a small pink/magenta STAR marker positioned above or on top of the sticker:
    - star present  → "have"   (newly acquired sticker; was missing, now owned)
    - no star       → "double" (duplicate copy already owned)
- The CLUB if readable (small text under the player name)

The star is a physical pink/magenta sticker marker placed by the collector. Look carefully — it sits above the sticker card, not printed on it.

Return ONLY valid JSON, no prose. Format:
{"stickers":[{"last":"DJIKU","country":"Ghana","club":"Spartak Moskva","status":"double"},{"last":"MAIGNAN","country":"France","status":"have"}, ...]}

For team badges (no player photo, just the federation logo), use last:"BADGE".
Include every clearly visible sticker. Skip stickers that are partially cut off or unreadable.
Country must be one of: Mexico, South Africa, Korea Republic, Czechia, Canada, Bosnia, Qatar, Switzerland, Brazil, Morocco, Haiti, Scotland, USA, Paraguay, Australia, Turkey, Germany, Curazao, Cote d Ivoire, Ecuador, Netherlands, Japan, Sweden, Tunisia, Belgium, Egypt, Iran, New Zealand, Spain, Cabo Verde, Saudi Arabia, Uruguay, France, Senegal, Iraq, Norway, Argentina, Algeria, Austria, Jordan, Portugal, Congo DR, Uzbekistan, Colombia, England, Croatia, Ghana, Panama.`;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured: GEMINI_API_KEY missing' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  let body;
  try { body = await req.json(); }
  catch (e) { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } }); }

  const { mode, country, imageBase64, mimeType } = body;
  if (!mode || !imageBase64 || !mimeType) {
    return new Response(JSON.stringify({ error: 'Missing mode / imageBase64 / mimeType' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!['album','doubles'].includes(mode)) {
    return new Response(JSON.stringify({ error: 'mode must be "album" or "doubles"' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (imageBase64.length > 8_000_000) {
    return new Response(JSON.stringify({ error: 'Image too large (>6MB). Please resize.' }), { status: 413, headers: { 'content-type': 'application/json' } });
  }

  const prompt = mode === 'album' ? albumPrompt(country) : doublesPrompt();

  const geminiBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0,
      response_mime_type: 'application/json'
    }
  };

  let geminiResp;
  try {
    geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(geminiBody)
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Gemini fetch failed: '+e.message }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  if (!geminiResp.ok) {
    const txt = await geminiResp.text();
    return new Response(JSON.stringify({ error: 'Gemini error', detail: txt.slice(0, 400) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const json = await geminiResp.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    return new Response(JSON.stringify({ error: 'Gemini returned non-JSON', raw: text.slice(0, 500) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const stickers = Array.isArray(parsed?.stickers) ? parsed.stickers : [];
  const cleaned = stickers
    .filter(s => s && typeof s === 'object' && ALLOWED_STATUS.includes(s.status))
    .slice(0, 200);

  // For album mode, prefer the country detected by Gemini; fall back to the country param
  const detectedCountry = mode === 'album' ? (parsed?.country || country) : (country || parsed?.country);

  return new Response(JSON.stringify({ mode, country: detectedCountry || null, stickers: cleaned, raw: text }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
