// Morning guard: if no broker session token from TODAY (IST) is stored by
// ~09:25, the scan and mock trader will skip the whole day silently. Email
// a heads-up instead so the user can log in. Exits 0 when all is well.

import { istDate } from '../src/engine/paperTrader'
import { PROXY_URL } from './lib/paperStore'

const SECRET = process.env.SCAN_SHARED_SECRET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const REPORT_TO = process.env.REPORT_TO ?? 'bhagwat.shree@gmail.com'
const REPORT_FROM = process.env.REPORT_FROM ?? 'NiveshPulse <onboarding@resend.dev>'
const APP_URL = 'https://bhagwatshree.github.io/nivesh-pulse/'

if (!SECRET) {
  console.error('SCAN_SHARED_SECRET is not set — refusing to run.')
  process.exit(1)
}

async function main() {
  const response = await fetch(`${PROXY_URL}/internal/token`, { headers: { Authorization: `Bearer ${SECRET}` } })
  if (!response.ok) throw new Error(`Token check failed: HTTP ${response.status}`)
  const body = (await response.json()) as { provider: string | null; accessToken: string | null; obtainedAt?: number }

  const today = istDate(new Date())
  const tokenDay = body.obtainedAt ? istDate(new Date(body.obtainedAt)) : null
  if (body.accessToken && tokenDay === today) {
    console.log(`Token OK (${body.provider}, obtained today).`)
    return
  }

  const why = body.accessToken
    ? `the stored ${body.provider} token is from ${tokenDay ?? 'an unknown day'}, not today`
    : 'no broker token is stored'
  console.warn(`Token problem: ${why}.`)
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set — cannot send the alert.')
    process.exit(1)
  }
  const mail = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REPORT_FROM,
      to: [REPORT_TO],
      subject: 'NiveshPulse: log in to Upstox — no trading today without it',
      html: `<p>Market is open but ${why}. The scanner and mock trader will skip today until you log in.</p><p><a href="${APP_URL}">Open NiveshPulse and press Connect Upstox</a>.</p>`,
    }),
  })
  if (!mail.ok) throw new Error(`Resend HTTP ${mail.status}: ${await mail.text()}`)
  console.log('Alert emailed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
