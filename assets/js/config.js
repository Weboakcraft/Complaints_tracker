/* ============================================================
   config.js — the only file you edit after deploying.
   ============================================================ */
window.CONFIG = {
  /**
   * Paste your Apps Script Web App /exec URL here after deploying.
   * Leave it empty to keep the app in DEMO MODE (seeded sample data,
   * nothing leaves the browser).
   */
  API_URL: 'https://script.google.com/macros/s/AKfycbwQW_kxo3mUJmYW6f0nxrlLXsWkndIbDfewWzFOXoF_y28Ihc-e7OkISV2pJvrRMBEc/exec',

  COMPANY: 'OakCraft',
  CURRENCY: '₹',
  TIMEZONE: 'Asia/Kolkata',

  /** Client-side guard rails; the server enforces these again. */
  LIMITS: {
    maxFiles: 5,
    maxInvoiceMB: 10,
    maxEvidenceMB: 100
  },

  /** Rows per page in the complaints table. */
  PAGE_SIZE: 25,

  /** SLA targets in hours, used to flag overdue complaints. */
  SLA_HOURS: { Critical: 24, High: 48, Medium: 72, Low: 120 }
};
