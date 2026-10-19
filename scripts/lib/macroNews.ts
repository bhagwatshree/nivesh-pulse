// Macro / geopolitical headlines from Google News RSS (free, no key).
// Used only as a coarse risk-off gate — see assessMacro in
// src/engine/paperTrader.ts. Headlines are untrusted text: they are only
// pattern-matched, never interpreted as instructions.

const QUERIES = [
  'Sensex Nifty today',
  'geopolitical tensions oil prices',
  'RBI Federal Reserve interest rates markets',
  'India stock market global cues',
]

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export async function fetchMacroHeadlines(nowMs: number): Promise<string[]> {
  const seen = new Set<string>()
  for (const q of QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:1d')}&hl=en-IN&gl=IN&ceid=IN:en`
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 nivesh-pulse' } })
      if (!response.ok) continue
      const xml = await response.text()
      for (const item of xml.split('<item>').slice(1)) {
        const title = /<title>(.*?)<\/title>/s.exec(item)?.[1]
        const pub = /<pubDate>(.*?)<\/pubDate>/s.exec(item)?.[1]
        if (!title) continue
        if (pub && nowMs - new Date(pub).getTime() > 24 * 3600 * 1000) continue
        seen.add(decode(title).trim())
      }
    } catch (err) {
      console.warn(`Macro news query "${q}" failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  return [...seen]
}
