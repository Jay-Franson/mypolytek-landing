# MyPolytek Landing Page

Professional landing page for Polytek of Rochester. Captures leads via a
multi-step form and pushes them to Google Sheets, Gmail, and Hatch CRM.

## Integrations

- ✅ **Google Sheets** - Leads saved to the "Polytek LP" tab in the Powrful spreadsheet
- ✅ **Gmail Notifications** - Email alerts sent to jay@powrful.com
- ✅ **Hatch CRM** - Contacts auto-created in Hatch with source `custom:landing-page-polytek`

> Integration destinations (sheet ID, email recipient, Hatch source) are
> **hardcoded server-side** in `api/submit-lead.js` (`DEALER_CONFIG`). The
> browser does NOT send integration config in the request body — this prevents
> an attacker from redirecting leads to their own destinations.

## Configuration

Edit `config.json` to customize:
- Dealer name and phone numbers (`phone` = call-us-now, `hatchPhone` = Hatch callback)
- Brand colors
- Hero section text and regions
- Promotion offer
- Service offerings
- Gallery images
- Testimonials

## Environment Variables

The same three variables are needed locally (`.env.local`) and in Vercel
(Settings → Environment Variables). See `.env.local.example` for the full
documented template.

```
GOOGLE_SERVICE_ACCOUNT_JSON=<full service account JSON as a single line>
GMAIL_APP_PASSWORD=<16-char Gmail app password>
HATCH_API_KEY=<Hatch API token>
```

Optional:

```
GMAIL_USER=jay@powrful.com   # override the sending Gmail account
```

## Security

- **Server-owned integration config** — sheet/email/Hatch targets are not accepted from the client.
- **Honeypot spam protection** — hidden `website` field; submissions with a
  filled honeypot are silently accepted and discarded.
- **Server-side validation** — email, phone, and zip format are validated before any external call.

For paid/ad traffic, consider also adding Cloudflare Turnstile.

## Deployment

1. Update `config.json` with your dealer details
2. Push to GitHub
3. Connect the repo to a Vercel project
4. Add the three environment variables in Vercel Settings → Environment Variables
5. Deploy

## Local Testing

```bash
npm install
npm run dev
```

Visit http://localhost:3000 to test the landing page.

Submit a test lead — on success you'll see a thank-you screen, and the lead
will be:
- Appended to the Google Sheet
- Emailed to the notification recipient
- Created as a contact in Hatch

If anything fails, the API returns `success: false` with an error message and
the form shows a fallback phone number to call.
