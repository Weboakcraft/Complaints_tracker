/**
 * OakCraft Complaint Management System
 * 00_Config.gs — single source of truth for schema, sheet names and defaults.
 *
 * Nothing in this file touches the network. Everything else in the project
 * reads its column positions from SCHEMA, so adding a field is a one-line
 * change here plus a re-run of Setup_initialiseSystem().
 */

var APP = {
  NAME: 'OakCraft Complaint Management System',
  VERSION: '1.0.0',
  TIMEZONE: 'Asia/Kolkata',
  ID_PREFIX: 'OAK-CMP',
  ROOT_FOLDER: 'Complaint Management',
  SESSION_TTL_SECONDS: 60 * 60 * 8,     // 8 hour login session
  CACHE_TTL_SECONDS: 45,                // dashboard / list cache
  MAX_INVOICE_MB: 10,
  MAX_EVIDENCE_MB: 100,
  MAX_FILES_PER_FIELD: 5
};

var SHEETS = {
  COMPLAINTS: 'COMPLAINTS',
  HISTORY: 'COMPLAINT_HISTORY',
  PAYMENTS: 'PAYMENTS',
  EMPLOYEES: 'EMPLOYEES',
  MASTER: 'MASTER_DATA',
  DASHBOARD: 'DASHBOARD_DATA',
  SETTINGS: 'SETTINGS'
};

/**
 * Column order IS the schema. Index = column number - 1.
 * Never reorder an existing array; append new fields to the end.
 */
var SCHEMA = {
  COMPLAINTS: [
    'complaint_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
    'customer_name', 'customer_mobile', 'order_number', 'purchase_date',
    'chair_type', 'purchase_source', 'complaint_type', 'description',
    'invoice_generated_by', 'invoice_files', 'evidence_files',
    'status', 'priority', 'assigned_to', 'department',
    'warranty_status', 'warranty_verified_by', 'warranty_verified_at', 'warranty_remarks',
    'payment_required', 'payment_status', 'payment_amount', 'payment_collected',
    'action_taken', 'resolution', 'resolution_date', 'tat_hours',
    'customer_confirmed', 'closed_at', 'reopened_count', 'is_deleted'
  ],
  COMPLAINT_HISTORY: [
    'history_id', 'complaint_id', 'timestamp', 'actor', 'actor_role',
    'action', 'field', 'from_value', 'to_value', 'remarks'
  ],
  PAYMENTS: [
    'payment_id', 'complaint_id', 'amount', 'payment_date', 'payment_mode',
    'reference_id', 'proof_file', 'collected_by', 'verified_by',
    'verification_status', 'remarks', 'created_at'
  ],
  EMPLOYEES: [
    'employee_id', 'name', 'email', 'password_hash', 'salt', 'role',
    'department', 'phone', 'active', 'created_at', 'last_login'
  ],
  MASTER_DATA: ['category', 'value', 'label', 'sort_order', 'active'],
  DASHBOARD_DATA: ['metric_key', 'metric_label', 'metric_value', 'computed_at'],
  SETTINGS: ['key', 'value', 'description']
};

/** Workflow states in lifecycle order. */
var STATUSES = [
  'Registered',
  'Under Verification',
  'Warranty Check',
  'Awaiting Payment',
  'Payment Verification',
  'Assigned',
  'In Progress',
  'Resolved',
  'Awaiting Customer Confirmation',
  'Closed',
  'Rejected'
];

/** Statuses that count as "finished" for resolution maths. */
var CLOSED_STATUSES = ['Resolved', 'Closed'];

var WARRANTY_STATUSES = ['Pending Verification', 'Under Warranty', 'Out of Warranty'];
var PAYMENT_STATUSES  = ['Not Required', 'Pending', 'Collected', 'Verified', 'Failed', 'Refunded'];
var PAYMENT_MODES     = ['UPI', 'Cash', 'Bank Transfer', 'Card', 'Cheque', 'Razorpay', 'Other'];
var PRIORITIES        = ['Low', 'Medium', 'High', 'Critical'];
var ROLES             = ['Admin', 'Manager', 'Complaint Executive', 'Technician', 'Viewer'];

var CHAIR_TYPES = [
  'Office Chair (Ergonomic/Task)',
  'Dining Chair',
  'Lounge/Accent Chair',
  'Bar/Counter Stool',
  'Outdoor Chair',
  'Other (Specify in Description)'
];

var PURCHASE_SOURCES = [
  'Company Website/Online Store',
  'Physical Retail Store (Our Brand)',
  'Third-Party Retailer (Amazon)',
  'Third-Party Retailer (Flipkart)',
  'Other'
];

var COMPLAINT_TYPES = [
  'Structural Defect',
  'Assembly Issue',
  'Comfort/Ergonomics Issue',
  'Material/Upholstery Damage',
  'Mechanism Failure',
  'Aesthetic/Finish Issue',
  'Other'
];

var INVOICE_ENTITIES = ['Vishu Sales', 'Naman Packaging', 'Kanha Creation', 'Capital Sales'];

var DEPARTMENTS = ['Customer Support', 'Service & Repair', 'Logistics', 'Quality', 'Accounts'];

/**
 * Role -> permission set. Checked on every write endpoint.
 * '*' means every permission.
 */
var PERMISSIONS = {
  'Admin': ['*'],
  'Manager': [
    'complaint.create', 'complaint.read.all', 'complaint.update', 'complaint.assign',
    'warranty.verify', 'payment.update', 'payment.verify', 'complaint.close',
    'dashboard.view', 'export.data', 'employee.read'
  ],
  'Complaint Executive': [
    'complaint.create', 'complaint.read.assigned', 'complaint.update',
    'warranty.verify', 'payment.update', 'dashboard.view'
  ],
  'Technician': [
    'complaint.read.assigned', 'complaint.update'
  ],
  'Viewer': [
    'complaint.read.all', 'dashboard.view', 'export.data'
  ]
};
