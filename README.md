# MyPolytek Landing Page

Professional landing page for lead capture and CRM integration.

## Integrations

- ✅ **Google Sheets** - Leads saved to "MyPolytek" tab in Powrful spreadsheet
- ✅ **Gmail Notifications** - Email alerts sent to jay@powrful.com
- ✅ **Hatch CRM** - Contacts auto-created in Hatch with source "custom:landing-page-polytek"

## Configuration

Edit `config.json` to customize:
- Dealer name and phone
- Brand colors
- Hero section text
- Service offerings
- Gallery images
- Testimonials

## Environment Variables (for Vercel)

```
GOOGLE_SERVICE_ACCOUNT_JSON=<paste full JSON from service account>
GMAIL_APP_PASSWORD=<your 16-char Gmail app password>
HATCH_API_KEY=<your Hatch API key>
```

## Deployment

1. Update `config.json` with your details
2. Push to GitHub
3. Connect to Vercel
4. Add environment variables in Vercel Settings
5. Deploy!

## Local Testing

```bash
npm install
npm run dev
```

Visit http://localhost:3000 to test the landing page.

Test the form - leads will be:
- Added to Google Sheet
- Sent via email
- Created in Hatch CRM
Gallery images deployed
