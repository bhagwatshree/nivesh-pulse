// Throwaway diagnostic: confirms (or rules out) whether GitHub Actions
// runner IPs can reach nseindia.com at all, before investing in the full
// announcements-fetch pipeline. Not part of the shipped feature — delete
// after use regardless of outcome.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

async function main() {
  const homepage = await fetch('https://www.nseindia.com/', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  console.log('homepage status:', homepage.status)
  const setCookie = homepage.headers.get('set-cookie')
  console.log('set-cookie present:', Boolean(setCookie))
  const bodySnippet = (await homepage.text()).slice(0, 300)
  console.log('body snippet:', bodySnippet)

  if (homepage.status !== 200) {
    console.log('Homepage blocked — not attempting the API call.')
    return
  }

  const cookie = setCookie ?? ''
  const api = await fetch('https://www.nseindia.com/api/corporate-announcements?index=equities', {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
      Cookie: cookie,
    },
  })
  console.log('api status:', api.status)
  const apiBody = await api.text()
  console.log('api body snippet:', apiBody.slice(0, 500))
}

main().catch((err) => {
  console.error('spike failed:', err)
  process.exit(1)
})
