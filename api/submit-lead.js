/**
 * Vercel API Route: submit-lead
 *
 * Generic lead submission handler for all dealer landing pages.
 * Integrates with: Google Sheets, Gmail Email, Hatch CRM, GoHighLevel, BuilderPrime
 *
 * Required environment variables (set in Vercel → Settings → Environment Variables):
 *   GOOGLE_SERVICE_ACCOUNT_JSON - Google Service Account credentials (JSON string)
 *   GMAIL_APP_PASSWORD          - Gmail app password for sending emails
 *   HATCH_API_KEY               - Hatch API key
 *   GHL_API_KEY                 - GoHighLevel API key (optional)
 *   BUILDERPRIME_API_KEY        - BuilderPrime API key (optional)
 *
 * Dealer-specific config (from config.json):
 *   integrations.googleSheets.spreadsheetId - Google Sheet to write leads to
 *   integrations.googleSheets.sheetName     - Tab name (e.g., "BAM", "MyPolytek")
 *   integrations.email.recipient            - Email address for notifications
 *   integrations.hatch.source               - Hatch source value
 */

const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const HATCH_BASE = "https://api.usehatchapp.com/v1";

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
    // Escape single quotes in sheet name and wrap in single quotes
    const escapedSheetName = sheetName.replace(/'/g, "''");
    const range = `'${escapedSheetName}'!A:H`;

    console.log(`Appending to sheet: ${range}`);

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });

    console.log("Row appended to Google Sheet:", response.data.updatedRange);
    return true;
  } catch (err) {
    console.error("Google Sheets error:", err.message);
    console.error("Full error:", err);
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

    console.log(`Email sent to ${recipient}`);
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

    console.log("Sending to Hatch:", JSON.stringify(contactBody));

    const hatchRes = await fetch(`${HATCH_BASE}/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HATCH_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contactBody),
    });

    const responseText = await hatchRes.text();

    if (!hatchRes.ok) {
      console.error("Hatch contact creation failed:", hatchRes.status, responseText);
      return false;
    }

    console.log("Hatch contact created successfully:", responseText);
    return true;
  } catch (err) {
    console.error("Hatch error:", err.message);
    return false;
  }
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const data = req.body;
  const { fname, lname, phone, email, zip, step1, step2, step3, integrations } = data;

  // Basic validation
  if (!fname || !phone || !email || !zip) {
    return res.status(400).json({ error: "Missing required fields: fname, phone, email, zip" });
  }

  const errors = [];
  const row = [new Date().toISOString(), fname, lname || "", phone, email, zip, step1 || "", step2 || "", step3 || ""];

  // ─────────────────────────────────────────────────────────
  // 1. Google Sheets — Append Lead
  // ─────────────────────────────────────────────────────────
  if (integrations?.googleSheets?.spreadsheetId && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const sheetName = integrations.googleSheets.sheetName || "Leads";
    const success = await appendToGoogleSheet(integrations.googleSheets.spreadsheetId, sheetName, row);
    if (!success) errors.push("Google Sheets failed");
  } else {
    console.warn("Google Sheets not configured");
  }

  // ─────────────────────────────────────────────────────────
  // 2. Gmail — Send Email Notification
  // ─────────────────────────────────────────────────────────
  if (integrations?.email?.recipient && process.env.GMAIL_APP_PASSWORD) {
    const success = await sendEmailNotification(integrations.email.recipient, fname, lname, phone, email, zip, step1, step2, step3);
    if (!success) errors.push("Email notification failed");
  } else {
    console.warn("Email not configured");
  }

  // ─────────────────────────────────────────────────────────
  // 3. Hatch CRM — Create Contact
  // ─────────────────────────────────────────────────────────
  if (integrations?.hatch?.source && process.env.HATCH_API_KEY) {
    const success = await createHatchContact(fname, lname, phone, email, zip, integrations.hatch.source);
    if (!success) errors.push("Hatch integration failed");
  } else {
    console.warn("Hatch not configured");
  }

  // Always return success to user (backend errors logged separately)
  return res.status(200).json({
    success: true,
    errors: errors.length > 0 ? errors : undefined,
  });
}
