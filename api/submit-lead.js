/**
 * Vercel API Route: submit-lead
 *
 * Lead submission handler for Polytek of Rochester landing page.
 * Integrates with: Google Sheets, Gmail Email, Hatch CRM
 *
 * Required environment variables (set in Vercel → Settings → Environment Variables):
 *   GOOGLE_SERVICE_ACCOUNT_JSON - Google Service Account credentials (JSON string)
 *   GMAIL_APP_PASSWORD          - Gmail app password for sending emails
 *   HATCH_API_KEY               - Hatch API key
 *
 * SECURITY NOTE: Integration destinations (sheet IDs, email recipients, Hatch source)
 * are server-owned constants below — NEVER trust these from the request body.
 */

const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const HATCH_BASE = "https://api.usehatchapp.com/v1";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// ─────────────────────────────────────────────────────────
// Server-owned dealer config (NEVER trust from request body)
// ─────────────────────────────────────────────────────────
const DEALER_CONFIG = {
  googleSheets: {
    spreadsheetId: "1SVcrZNxtt6NgCpMDaTfWjNouH8FYgseoQ_A-OU72Jkg",
    sheetName: "Polytek LP",
  },
  email: {
    recipient: "jay@powrful.com",
  },
  hatch: {
    source: "custom:landing-page-polytek",
  },
};

let gmailTransporter = null;
let sheetsClient = null;

async function initGmailTransporter() {
  if (gmailTransporter) return gmailTransporter;

  gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER || "jay@powrful.com",
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  return gmailTransporter;
}

async function initSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function appendToGoogleSheet(spreadsheetId, sheetName, row) {
  try {
    const sheets = await initSheetsClient();
    const escapedSheetName = sheetName.replace(/'/g, "''");
    const range = `'${escapedSheetName}'!A:I`;

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    console.log("Sheets: lead saved", response.data.updatedRange);
    return true;
  } catch (err) {
    console.error("Sheets error:", err.message);
    return false;
  }
}

async function sendEmailNotification(recipient, fname, lname, phone, email, zip, step1, step2, step3) {
  try {
    const transporter = await initGmailTransporter();

    const emailBody = `
New Lead Received:

Name: ${fname} ${lname}
Phone: ${phone}
Email: ${email}
Zip Code: ${zip}

Project Type: ${step1 || "Not specified"}
Timeline: ${step2 || "Not specified"}
Homeowner: ${step3 || "Not specified"}

---
This email was sent automatically from your landing page form.
    `;

    await transporter.sendMail({
      from: process.env.GMAIL_USER || "jay@powrful.com",
      to: recipient,
      subject: `New Lead: ${fname} ${lname}`,
      text: emailBody,
    });

    console.log("Email: notification sent");
    return true;
  } catch (err) {
    console.error("Email error:", err.message);
    return false;
  }
}

async function createHatchContact(fname, lname, phone, email, zip, source) {
  try {
    const contactBody = {
      firstName: fname,
      lastName: lname || "",
      phone,
      email,
      zip,
      source,
    };

    const hatchRes = await fetch(`${HATCH_BASE}/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HATCH_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contactBody),
    });

    if (!hatchRes.ok) {
      // Don't log the raw response body — Hatch may echo back the
      // contact data (name/phone/email/zip) we just sent.
      // Status code alone is enough to investigate.
      console.error("Hatch error: status", hatchRes.status);
      return false;
    }

    console.log("Hatch: contact created");
    return true;
  } catch (err) {
    // err.message from fetch failures (network, DNS) does not contain PII.
    console.error("Hatch error:", err.message);
    return false;
  }
}

// Basic email + phone format validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function isValidZip(zip) {
  return /^\d{5}(-\d{4})?$/.test(String(zip).trim());
}

// ─────────────────────────────────────────────────────────
// Cloudflare Turnstile — server-side token verification
// Returns { ok: true } on success, { ok: false, reason } otherwise.
// If TURNSTILE_SECRET_KEY is not set, verification is skipped with a
// warning (allows local development without the secret).
// ─────────────────────────────────────────────────────────
async function verifyTurnstile(token, remoteIp) {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.warn("TURNSTILE_SECRET_KEY not set — skipping bot verification");
    return { ok: true, skipped: true };
  }
  if (!token) {
    return { ok: false, reason: "missing-token" };
  }
  try {
    const params = new URLSearchParams();
    params.append("secret", process.env.TURNSTILE_SECRET_KEY);
    params.append("response", token);
    if (remoteIp) params.append("remoteip", remoteIp);

    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const result = await r.json();
    if (result.success) {
      return { ok: true };
    }
    console.error("Turnstile failed:", result["error-codes"]);
    return { ok: false, reason: "verification-failed", codes: result["error-codes"] };
  } catch (err) {
    console.error("Turnstile verify error:", err.message);
    return { ok: false, reason: "verify-error" };
  }
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const data = req.body || {};
  const { fname, lname, phone, email, zip, step1, step2, step3, website, turnstileToken } = data;

  // ─────────────────────────────────────────────────────────
  // SPAM PROTECTION — Honeypot
  // Bots fill all fields including the hidden "website" field.
  // Real users can't see it, so it should always be empty.
  // ─────────────────────────────────────────────────────────
  if (website && String(website).trim() !== "") {
    console.log("Honeypot triggered — silent reject");
    // Return success to not tip off bots
    return res.status(200).json({ success: true });
  }

  // ─────────────────────────────────────────────────────────
  // BOT PROTECTION — Cloudflare Turnstile
  // ─────────────────────────────────────────────────────────
  const remoteIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "";
  const turnstile = await verifyTurnstile(turnstileToken, remoteIp);
  if (!turnstile.ok) {
    return res.status(403).json({
      success: false,
      error: "Bot verification failed. Please refresh the page and try again.",
    });
  }

  // ─────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────
  if (!fname || !phone || !email || !zip) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: fname, phone, email, zip",
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Invalid email format" });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({ success: false, error: "Invalid phone format" });
  }

  if (!isValidZip(zip)) {
    return res.status(400).json({ success: false, error: "Invalid zip format" });
  }

  const row = [
    new Date().toISOString(),
    fname,
    lname || "",
    phone,
    email,
    zip,
    step1 || "",
    step2 || "",
    step3 || "",
  ];

  // ─────────────────────────────────────────────────────────
  // 1. Google Sheets — Append Lead (CRITICAL — this is our system of record)
  // ─────────────────────────────────────────────────────────
  let sheetsOk = false;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    sheetsOk = await appendToGoogleSheet(
      DEALER_CONFIG.googleSheets.spreadsheetId,
      DEALER_CONFIG.googleSheets.sheetName,
      row
    );
  } else {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  }

  // ─────────────────────────────────────────────────────────
  // 2. Gmail — Send Email Notification (non-critical)
  // ─────────────────────────────────────────────────────────
  let emailOk = false;
  if (process.env.GMAIL_APP_PASSWORD) {
    emailOk = await sendEmailNotification(
      DEALER_CONFIG.email.recipient,
      fname, lname, phone, email, zip, step1, step2, step3
    );
  } else {
    console.error("GMAIL_APP_PASSWORD not set");
  }

  // ─────────────────────────────────────────────────────────
  // 3. Hatch CRM — Create Contact (non-critical)
  // ─────────────────────────────────────────────────────────
  let hatchOk = false;
  if (process.env.HATCH_API_KEY) {
    hatchOk = await createHatchContact(
      fname, lname, phone, email, zip,
      DEALER_CONFIG.hatch.source
    );
  } else {
    console.error("HATCH_API_KEY not set");
  }

  // ─────────────────────────────────────────────────────────
  // Honest response — only success if Sheets OR Email succeeded
  // (so we know the lead is captured somewhere)
  // ─────────────────────────────────────────────────────────
  const leadCaptured = sheetsOk || emailOk;

  if (!leadCaptured) {
    console.error("CRITICAL: Lead not captured anywhere", {
      sheetsOk, emailOk, hatchOk,
    });
    return res.status(500).json({
      success: false,
      error: "Unable to save your information. Please call us directly.",
    });
  }

  return res.status(200).json({
    success: true,
    warnings: {
      sheetsOk,
      emailOk,
      hatchOk,
    },
  });
}
