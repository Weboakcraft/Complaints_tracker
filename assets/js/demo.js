/* ============================================================
   demo.js — an in-browser stand-in for the Apps Script backend.

   It mirrors the real API's actions, validation and permission rules so the
   UI can be explored before (or without) a deployment. The moment you set
   CONFIG.API_URL, this file is bypassed entirely. Data lives in memory only
   and resets on reload — nothing is written to localStorage.
   ============================================================ */
(function () {
  'use strict';

  var CHAIR_TYPES = ['Office Chair (Ergonomic/Task)','Dining Chair','Lounge/Accent Chair','Bar/Counter Stool','Outdoor Chair','Other (Specify in Description)'];
  var PURCHASE_SOURCES = ['Company Website/Online Store','Physical Retail Store (Our Brand)','Third-Party Retailer (Amazon)','Third-Party Retailer (Flipkart)','Other'];
  var COMPLAINT_TYPES = ['Structural Defect','Assembly Issue','Comfort/Ergonomics Issue','Material/Upholstery Damage','Mechanism Failure','Aesthetic/Finish Issue','Other'];
  var INVOICE_ENTITIES = ['Vishu Sales','Naman Packaging','Kanha Creation','Capital Sales'];
  var STATUSES = ['Registered','Under Verification','Warranty Check','Awaiting Payment','Payment Verification','Assigned','In Progress','Resolved','Awaiting Customer Confirmation','Closed','Rejected'];
  var CLOSED = ['Resolved','Closed'];
  var WARRANTY_STATUSES = ['Pending Verification','Under Warranty','Out of Warranty'];
  var PAYMENT_STATUSES = ['Not Required','Pending','Collected','Verified','Failed','Refunded'];
  var PAYMENT_MODES = ['UPI','Cash','Bank Transfer','Card','Cheque','Razorpay','Other'];
  var PRIORITIES = ['Low','Medium','High','Critical'];
  var DEPARTMENTS = ['Customer Support','Service & Repair','Logistics','Quality','Accounts'];
  var ROLES = ['Admin','Manager','Complaint Executive','Technician','Viewer'];

  var TRANSITIONS = {
    'Registered':['Under Verification','Warranty Check','Assigned','Rejected'],
    'Under Verification':['Warranty Check','Assigned','Rejected'],
    'Warranty Check':['Awaiting Payment','Assigned','Rejected'],
    'Awaiting Payment':['Payment Verification','Assigned','Rejected'],
    'Payment Verification':['Assigned','In Progress','Rejected'],
    'Assigned':['In Progress','Resolved','Rejected'],
    'In Progress':['Resolved','Awaiting Customer Confirmation','Rejected'],
    'Resolved':['Awaiting Customer Confirmation','Closed','In Progress'],
    'Awaiting Customer Confirmation':['Closed','In Progress'],
    'Closed':['In Progress'],
    'Rejected':['Under Verification']
  };

  var PERMISSIONS = {
    'Admin':['*'],
    'Manager':['complaint.create','complaint.read.all','complaint.update','complaint.assign','warranty.verify','payment.update','payment.verify','complaint.close','dashboard.view','export.data','employee.read'],
    'Complaint Executive':['complaint.create','complaint.read.assigned','complaint.update','warranty.verify','payment.update','dashboard.view'],
    'Technician':['complaint.read.assigned','complaint.update'],
    'Viewer':['complaint.read.all','dashboard.view','export.data']
  };

  var EMPLOYEES = [
    { employee_id:'EMP-001', name:'System Administrator', email:'admin@oakcraft.in', role:'Admin', department:'Customer Support', active:'TRUE' },
    { employee_id:'EMP-002', name:'Ritu Sharma',  email:'ritu@oakcraft.in',  role:'Complaint Executive', department:'Customer Support', active:'TRUE' },
    { employee_id:'EMP-003', name:'Aman Verma',   email:'aman@oakcraft.in',  role:'Complaint Executive', department:'Customer Support', active:'TRUE' },
    { employee_id:'EMP-004', name:'Pooja Nair',   email:'pooja@oakcraft.in', role:'Manager', department:'Service & Repair', active:'TRUE' },
    { employee_id:'EMP-005', name:'Rahul Mehta',  email:'rahul@oakcraft.in', role:'Technician', department:'Service & Repair', active:'TRUE' },
    { employee_id:'EMP-006', name:'Sneha Gupta',  email:'sneha@oakcraft.in', role:'Viewer', department:'Quality', active:'TRUE' }
  ];

  var COMPLAINTS = [], HISTORY = [], PAYMENTS = [], SEQ = {};
  var SESSIONS = {};

  /* ---------------- helpers ---------------- */
  function pad(n, w){ var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function iso(d){ return new Date(d).toISOString(); }
  function dateOnly(d){ return new Date(d).toISOString().slice(0,10); }
  function dayKey(d){ return new Date(d).toISOString().slice(0,10); }
  function pct(a,b){ return b ? Math.round((a/b)*1000)/10 : 0; }
  function uid(p){ return p + '-' + Math.random().toString(36).slice(2,10).toUpperCase(); }
  function ok(data, meta){ return { success:true, data:data===undefined?null:data, meta:meta||{} }; }
  function fail(code,msg,details){ return { success:false, error:{ code:code, message:msg, details:details||null } }; }
  function hoursBetween(a,b){ return Math.round(((new Date(b)-new Date(a))/36e5)*10)/10; }

  function nextId(when){
    var d = dayKey(when).replace(/-/g,'');
    SEQ[d] = (SEQ[d]||0) + 1;
    return 'OAK-CMP-' + d + '-' + pad(SEQ[d],4);
  }

  function can(session, perm){
    var p = PERMISSIONS[session.role] || [];
    return p.indexOf('*') !== -1 || p.indexOf(perm) !== -1;
  }
  function need(session, perm){
    if (!can(session, perm)) {
      throw { code:'FORBIDDEN', message:'Your role (' + session.role + ') is not allowed to perform this action.' };
    }
  }
  function scope(session, rows){
    if (can(session,'complaint.read.all')) return rows;
    var e = session.email.toLowerCase();
    return rows.filter(function(r){
      return String(r.assigned_to).toLowerCase() === e || String(r.created_by).toLowerCase() === e;
    });
  }

  /* ---------------- seed ---------------- */
  var CUSTOMERS = ['Rohit Khanna','Meera Iyer','Sanjay Patel','Divya Rao','Imran Shaikh','Kavita Joshi','Arjun Desai','Neha Bhatt','Vikram Singh','Anjali Menon','Tarun Kapoor','Priya Chawla','Harsh Agarwal','Sunita Pillai','Deepak Yadav','Ritika Bose','Mohit Jain','Farah Khan','Nikhil Reddy','Shalini Dutta','Gaurav Malhotra','Ananya Ghosh','Rakesh Kulkarni','Simran Kaur','Manish Tiwari','Leela Krishnan','Varun Saxena','Pallavi Shetty','Zoya Ansari','Kunal Bhardwaj','Ira Chatterjee','Sameer Qureshi','Nandini Rao','Abhay Pawar','Tanvi Sheth','Yash Dalmia'];

  var DESCRIPTIONS = {
    'Structural Defect':'The chair base developed a visible crack near the weld within a few weeks of normal use.',
    'Assembly Issue':'Two bolt holes on the seat plate do not line up with the supplied bracket, so assembly cannot be completed.',
    'Comfort/Ergonomics Issue':'Lumbar support sits far lower than shown on the product page and causes back strain within an hour.',
    'Material/Upholstery Damage':'Fabric on the left armrest has frayed and the seam has opened along a 6 cm stretch.',
    'Mechanism Failure':'The gas lift no longer holds height; the seat sinks fully within a minute of sitting down.',
    'Aesthetic/Finish Issue':'Noticeable scratches and a patch of uneven polish on the right leg, visible on delivery.',
    'Other':'Castors squeak loudly on hard flooring and one wheel keeps detaching from its socket.'
  };
  var ACTIONS = {
    'Structural Defect':'Replacement base dispatched and fitted on site by the service team.',
    'Assembly Issue':'Corrected bracket shipped with an illustrated assembly guide; installation confirmed.',
    'Comfort/Ergonomics Issue':'Lumbar module swapped for the adjustable variant at no cost.',
    'Material/Upholstery Damage':'Armrest upholstery re-stitched and matched to the original fabric.',
    'Mechanism Failure':'Gas lift cylinder replaced and load-tested on site.',
    'Aesthetic/Finish Issue':'Leg refinished at the workshop and returned within the TAT window.',
    'Other':'Castor set replaced with the heavy-duty variant.'
  };

  function hist(id, when, actor, role, action, field, from, to, remarks){
    HISTORY.push({ history_id:uid('HIS'), complaint_id:id, timestamp:iso(when), actor:actor, actor_role:role,
      action:action, field:field||'', from_value:from==null?'':String(from), to_value:to==null?'':String(to), remarks:remarks||'' });
  }

  function seed(){
    var staff = EMPLOYEES.slice(1,5);
    var now = Date.now();
    // Build oldest-first so complaint IDs run in chronological order.
    for (var i = CUSTOMERS.length - 1; i >= 0; i--) {
      var daysAgo = Math.floor(i * 1.55);
      var created = new Date(now - daysAgo*864e5 - (i*41*6e4));
      var id = nextId(created);
      var owner = staff[i % staff.length];
      var source = PURCHASE_SOURCES[(i*3) % PURCHASE_SOURCES.length];
      var chair = CHAIR_TYPES[(i*2) % CHAIR_TYPES.length];
      var issue = COMPLAINT_TYPES[i % COMPLAINT_TYPES.length];
      var resolved = (i % 3 !== 0) && daysAgo > 1;
      var outOfWarranty = (i % 4 === 1);
      var warrantyPending = (i % 9 === 0) && !resolved;
      var tat = resolved ? (10 + (i % 11) * 8.5) : '';
      var resolvedAt = resolved ? new Date(created.getTime() + tat*36e5) : '';
      var amount = outOfWarranty ? (450 + (i % 5) * 300) : 0;

      var rec = {
        complaint_id:id, created_at:iso(created), created_by:owner.email,
        updated_at:iso(resolved ? resolvedAt : created), updated_by:owner.email,
        customer_name:CUSTOMERS[i],
        customer_mobile:'9' + pad(100000000 + i*7919, 9).slice(0,9),
        order_number:'OAK-ORD-' + (24180 + i*13),
        purchase_date:dateOnly(new Date(created.getTime() - (25 + i*6)*864e5)),
        chair_type:chair, purchase_source:source, complaint_type:issue,
        description:DESCRIPTIONS[issue],
        invoice_generated_by:INVOICE_ENTITIES[i % INVOICE_ENTITIES.length],
        invoice_files:[], evidence_files:[],
        status: resolved ? (i % 7 === 0 ? 'Resolved' : 'Closed')
                         : ['Registered','Under Verification','Warranty Check','Assigned','In Progress'][i % 5],
        priority:PRIORITIES[(i*5) % PRIORITIES.length],
        assigned_to:owner.email, department:owner.department,
        warranty_status: warrantyPending ? 'Pending Verification' : (outOfWarranty ? 'Out of Warranty' : 'Under Warranty'),
        warranty_verified_by: warrantyPending ? '' : owner.email,
        warranty_verified_at: warrantyPending ? '' : iso(new Date(created.getTime()+54e5)),
        warranty_remarks: warrantyPending ? '' : (outOfWarranty ? 'Purchased beyond the 12-month cover.' : 'Invoice verified, within cover.'),
        payment_required: outOfWarranty ? 'TRUE' : 'FALSE',
        payment_status: outOfWarranty ? (resolved ? 'Verified' : 'Pending') : 'Not Required',
        payment_amount: amount,
        payment_collected: (outOfWarranty && resolved) ? amount : 0,
        action_taken: resolved ? ACTIONS[issue] : '',
        resolution: resolved ? 'Issue rectified and verified with the customer.' : '',
        resolution_date: resolved ? iso(resolvedAt) : '',
        tat_hours: tat,
        customer_confirmed: resolved ? 'TRUE' : 'FALSE',
        closed_at: (resolved && i % 7 !== 0) ? iso(resolvedAt) : '',
        reopened_count: (i % 13 === 0) ? 1 : 0,
        is_deleted:'FALSE'
      };
      COMPLAINTS.push(rec);

      hist(id, created, owner.email, owner.role, 'Complaint Registered', 'status', '', 'Registered', source + ' · ' + issue);
      if (!warrantyPending) {
        hist(id, new Date(created.getTime()+54e5), owner.email, owner.role, 'Warranty Verified',
          'warranty_status', 'Pending Verification', rec.warranty_status, rec.warranty_remarks);
      }
      if (outOfWarranty) {
        hist(id, new Date(created.getTime()+72e5), owner.email, owner.role, 'Payment Required', 'payment_amount', '', '₹'+amount, 'Out-of-warranty paid service');
        if (resolved) {
          var payDate = new Date(created.getTime()+108e5);
          PAYMENTS.push({ payment_id:uid('PAY'), complaint_id:id, amount:amount, payment_date:dateOnly(payDate),
            payment_mode:PAYMENT_MODES[i % PAYMENT_MODES.length], reference_id:'TXN'+(90210+i*31), proof_file:[],
            collected_by:owner.email, verified_by:'pooja@oakcraft.in', verification_status:'Verified',
            remarks:'Collected before dispatch of spare.', created_at:iso(payDate) });
          hist(id, payDate, owner.email, owner.role, 'Payment Recorded', 'payment_collected', 0, amount, PAYMENT_MODES[i % PAYMENT_MODES.length]);
          hist(id, new Date(payDate.getTime()+36e5), 'pooja@oakcraft.in', 'Manager', 'Payment Verified', 'payment_status', 'Collected', 'Verified', '');
        }
      }
      if (resolved) {
        hist(id, new Date(created.getTime()+ (tat*36e5)/2), owner.email, owner.role, 'Status Changed', 'status', 'Assigned', 'In Progress', '');
        hist(id, resolvedAt, owner.email, owner.role, 'Status Changed', 'status', 'In Progress', rec.status, ACTIONS[issue]);
        if (rec.status === 'Closed') {
          hist(id, resolvedAt, owner.email, owner.role, 'Customer Confirmed Resolution', 'customer_confirmed', 'FALSE', 'TRUE', '');
        }
      }
    }
    COMPLAINTS.reverse();            // newest first, like the real list endpoint
  }
  seed();

  /* ---------------- metrics (mirrors 06_Dashboard.gs) ---------------- */
  function computeMetrics(rows){
    var today = dayKey(new Date());
    var total = rows.length;
    var c = { today:0, todayResolved:0, open:0, resolved:0, warranty:0, nonWarranty:0,
              warrantyPending:0, paid:0, payPending:0, reopened:0 };
    var tatSum=0, tatCount=0, collected=0, pendingAmt=0;
    var bySource={}, byChair={}, byIssue={}, byStatus={}, byEmp={}, byDay={}, byPriority={};
    var empTat={}, oldest=null;

    function bump(map,key,res){
      key = key || 'Unspecified';
      if(!map[key]) map[key]={label:key,total:0,resolved:0,pending:0};
      map[key].total++;
      if(res) map[key].resolved++; else map[key].pending++;
    }

    rows.forEach(function(r){
      var res = CLOSED.indexOf(r.status) !== -1;
      var dk = dayKey(r.created_at);
      if (dk === today){ c.today++; if(res) c.todayResolved++; }
      if (res) c.resolved++; else c.open++;
      if (Number(r.reopened_count||0) > 0) c.reopened++;
      if (r.warranty_status === 'Under Warranty') c.warranty++;
      else if (r.warranty_status === 'Out of Warranty') c.nonWarranty++;
      else c.warrantyPending++;
      if (String(r.payment_required) === 'TRUE') c.paid++;
      if (r.payment_status === 'Pending'){ c.payPending++; pendingAmt += Number(r.payment_amount||0); }
      collected += Number(r.payment_collected||0);
      if (res && r.tat_hours !== '' && !isNaN(Number(r.tat_hours))){ tatSum += Number(r.tat_hours); tatCount++; }

      bump(bySource, r.purchase_source, res);
      bump(byChair, r.chair_type, res);
      bump(byIssue, r.complaint_type, res);
      bump(byStatus, r.status, res);
      bump(byPriority, r.priority, res);
      var who = r.assigned_to || 'Unassigned';
      bump(byEmp, who, res);
      if (!empTat[who]) empTat[who] = { s:0, n:0 };
      if (res && r.tat_hours !== ''){ empTat[who].s += Number(r.tat_hours); empTat[who].n++; }

      if (!byDay[dk]) byDay[dk] = { label:dk, total:0, resolved:0, pending:0 };
      byDay[dk].total++;
      if (res) byDay[dk].resolved++; else byDay[dk].pending++;

      if (!res && (!oldest || new Date(r.created_at) < new Date(oldest.created_at))) oldest = r;
    });

    function list(map){
      return Object.keys(map).map(function(k){
        var o = map[k];
        o.resolution_pct = pct(o.resolved,o.total);
        o.share_pct = pct(o.total,total);
        return o;
      }).sort(function(a,b){ return b.total - a.total; });
    }

    var chairList = list(byChair), issueList = list(byIssue), sourceList = list(bySource);
    var empList = list(byEmp).map(function(e){
      var t = empTat[e.label] || {s:0,n:0};
      e.avg_tat_hours = t.n ? Math.round((t.s/t.n)*10)/10 : null;
      return e;
    });

    return {
      generated_at: iso(new Date()),
      kpi:{
        total_complaints: total,
        complaints_today: c.today,
        resolved_today: c.todayResolved,
        open_complaints: c.open,
        resolved_complaints: c.resolved,
        reopened_complaints: c.reopened,
        warranty_complaints: c.warranty,
        non_warranty_complaints: c.nonWarranty,
        warranty_pending: c.warrantyPending,
        paid_service_complaints: c.paid,
        payment_pending_count: c.payPending,
        amount_collected: Math.round(collected),
        amount_pending: Math.round(pendingAmt),
        resolution_pct: pct(c.resolved,total),
        pending_pct: pct(c.open,total),
        warranty_pct: pct(c.warranty,total),
        non_warranty_pct: pct(c.nonWarranty,total),
        paid_service_pct: pct(c.paid,total),
        avg_resolution_hours: tatCount ? Math.round((tatSum/tatCount)*10)/10 : null,
        avg_resolution_days: tatCount ? Math.round((tatSum/tatCount/24)*10)/10 : null,
        oldest_pending: oldest ? {
          complaint_id: oldest.complaint_id, customer_name: oldest.customer_name,
          created_at: oldest.created_at, status: oldest.status,
          age_days: Math.floor(hoursBetween(oldest.created_at, new Date())/24)
        } : null,
        most_complained_product: chairList.length ? chairList[0].label : null,
        most_common_issue: issueList.length ? issueList[0].label : null,
        top_source: sourceList.length ? sourceList[0].label : null
      },
      by_source: sourceList,
      by_chair_type: chairList,
      by_issue_type: issueList,
      by_status: list(byStatus),
      by_priority: list(byPriority),
      by_employee: empList,
      trend: Object.keys(byDay).sort().map(function(k){ return byDay[k]; }).slice(-30)
    };
  }

  /* ---------------- find / serialise ---------------- */
  function find(id){
    for (var i=0;i<COMPLAINTS.length;i++) if (COMPLAINTS[i].complaint_id === id) return COMPLAINTS[i];
    throw { code:'NOT_FOUND', message:'Complaint not found: ' + id };
  }
  function ser(r){
    var o = {};
    for (var k in r) o[k] = r[k];
    o.is_open = CLOSED.indexOf(r.status) === -1;
    o.age_hours = o.is_open ? hoursBetween(r.created_at, new Date()) : r.tat_hours;
    return o;
  }
  function timelineFor(id){
    return HISTORY.filter(function(h){ return h.complaint_id === id; })
      .sort(function(a,b){ return a.timestamp < b.timestamp ? -1 : 1; });
  }

  /* ---------------- routes ---------------- */
  var ROUTES = {
    ping: function(){ return ok({ app:'OakCraft CMS (demo)', version:'1.0.0', time:iso(new Date()) }); },

    login: function(p){
      var email = String(p.email||'').toLowerCase().trim();
      var user = EMPLOYEES.filter(function(e){ return e.email.toLowerCase() === email; })[0];
      if (!user || String(p.password) !== 'OakCraft@2026') {
        throw { code:'AUTH_FAILED', message:'Invalid email or password. In demo mode the password is OakCraft@2026.' };
      }
      var token = uid('TOK');
      SESSIONS[token] = { token:token, employee_id:user.employee_id, name:user.name, email:user.email,
                          role:user.role, department:user.department };
      return ok({ token:token, user:SESSIONS[token], permissions:PERMISSIONS[user.role] || [] });
    },

    logout: function(p,s){ delete SESSIONS[s.token]; return ok({ loggedOut:true }); },
    me: function(p,s){ return ok({ user:s, permissions:PERMISSIONS[s.role] }); },

    masterData: function(){
      return ok({
        chair_types:CHAIR_TYPES, purchase_sources:PURCHASE_SOURCES, complaint_types:COMPLAINT_TYPES,
        invoice_entities:INVOICE_ENTITIES, statuses:STATUSES, warranty_statuses:WARRANTY_STATUSES,
        payment_statuses:PAYMENT_STATUSES, payment_modes:PAYMENT_MODES, priorities:PRIORITIES,
        departments:DEPARTMENTS, roles:ROLES, transitions:TRANSITIONS,
        employees: EMPLOYEES.map(function(e){ return { name:e.name, email:e.email, role:e.role, department:e.department }; }),
        limits:{ max_files:5, max_invoice_mb:10, max_evidence_mb:100 }
      });
    },

    createComplaint: function(p,s){
      need(s,'complaint.create');
      ['customer_name','customer_mobile','order_number','purchase_date','chair_type',
       'purchase_source','complaint_type','description','invoice_generated_by'].forEach(function(f){
        if (!p[f] || !String(p[f]).trim()) throw { code:'VALIDATION_FAILED', message:'Missing required field: ' + f };
      });
      var mobile = String(p.customer_mobile).replace(/\D/g,'').slice(-10);
      if (mobile.length !== 10) throw { code:'VALIDATION_FAILED', message:'Mobile number must be 10 digits.' };

      var dup = COMPLAINTS.filter(function(r){
        return String(r.order_number).toUpperCase() === String(p.order_number).toUpperCase() &&
               r.complaint_type === p.complaint_type && r.customer_mobile === mobile &&
               (Date.now() - new Date(r.created_at)) < 864e5;
      })[0];
      if (dup && !p.force) {
        throw { code:'DUPLICATE_COMPLAINT',
                message:'A complaint for this order and issue was already registered as ' + dup.complaint_id + '.',
                details:{ complaint_id: dup.complaint_id } };
      }

      var now = new Date(), id = nextId(now);
      var files = { invoice_files:[], evidence_files:[] };
      ['invoice_files','evidence_files'].forEach(function(key){
        (p[key]||[]).forEach(function(f,i){
          files[key].push({ id:uid('FILE'), name:f.name, url:'#demo-file', size:f.size||0, type:f.mimeType||'' });
        });
      });

      var rec = {
        complaint_id:id, created_at:iso(now), created_by:s.email, updated_at:iso(now), updated_by:s.email,
        customer_name:String(p.customer_name).trim(), customer_mobile:mobile,
        order_number:String(p.order_number).trim().toUpperCase(), purchase_date:p.purchase_date,
        chair_type:p.chair_type, purchase_source:p.purchase_source, complaint_type:p.complaint_type,
        description:String(p.description).trim(), invoice_generated_by:p.invoice_generated_by,
        invoice_files:files.invoice_files, evidence_files:files.evidence_files,
        status:'Registered', priority:p.priority || 'Medium',
        assigned_to:p.assigned_to || '', department:p.department || 'Customer Support',
        warranty_status:'Pending Verification', warranty_verified_by:'', warranty_verified_at:'', warranty_remarks:'',
        payment_required:'FALSE', payment_status:'Not Required', payment_amount:0, payment_collected:0,
        action_taken:'', resolution:'', resolution_date:'', tat_hours:'',
        customer_confirmed:'FALSE', closed_at:'', reopened_count:0, is_deleted:'FALSE'
      };
      COMPLAINTS.unshift(rec);
      hist(id, now, s.email, s.role, 'Complaint Registered', 'status', '', 'Registered', p.purchase_source + ' · ' + p.complaint_type);
      if (files.invoice_files.length + files.evidence_files.length) {
        hist(id, now, s.email, s.role, 'Files Attached', 'attachments', '',
          (files.invoice_files.length + files.evidence_files.length) + ' file(s)', '');
      }
      return ok({ complaint_id:id, status:'Registered', files:files });
    },

    listComplaints: function(p,s){
      var rows = scope(s, COMPLAINTS.filter(function(r){ return r.is_deleted !== 'TRUE'; }));
      var f = p.filters || {};
      if (f.q){
        var q = String(f.q).toLowerCase();
        rows = rows.filter(function(r){
          return [r.complaint_id,r.customer_name,r.customer_mobile,r.order_number,r.description,r.assigned_to,r.chair_type,r.complaint_type]
            .join(' ').toLowerCase().indexOf(q) !== -1;
        });
      }
      if (f.date_from){ var fr = new Date(f.date_from).getTime(); rows = rows.filter(function(r){ return new Date(r.created_at).getTime() >= fr; }); }
      if (f.date_to){ var to = new Date(f.date_to).getTime()+86399000; rows = rows.filter(function(r){ return new Date(r.created_at).getTime() <= to; }); }
      ['purchase_source','warranty_status','status','assigned_to','chair_type','complaint_type','payment_status','priority'].forEach(function(k){
        if (f[k]) rows = rows.filter(function(r){ return String(r[k]) === String(f[k]); });
      });
      if (f.pending_only) rows = rows.filter(function(r){ return CLOSED.indexOf(r.status) === -1; });

      var by = p.sort_by || 'created_at', dir = p.sort_dir === 'asc' ? 1 : -1;
      rows = rows.slice().sort(function(a,b){
        var av=a[by], bv=b[by];
        if (av === bv) return 0;
        if (av === '' || av == null) return 1;
        if (bv === '' || bv == null) return -1;
        return (av > bv ? 1 : -1) * dir;
      });

      var total = rows.length;
      var page = Math.max(1, Number(p.page||1));
      var size = Math.min(500, Math.max(1, Number(p.page_size||50)));
      var slice = p.all ? rows : rows.slice((page-1)*size, page*size);
      return ok(slice.map(ser), { total:total, page:page, page_size:size, pages:Math.max(1,Math.ceil(total/size)) });
    },

    getComplaint: function(p,s){
      var r = find(p.complaint_id);
      if (!scope(s,[r]).length) throw { code:'FORBIDDEN', message:'This complaint is not assigned to you.' };
      return ok({ complaint:ser(r), timeline:timelineFor(r.complaint_id),
                  payments:PAYMENTS.filter(function(x){ return x.complaint_id === r.complaint_id; }) });
    },

    getTimeline: function(p,s){ find(p.complaint_id); return ok(timelineFor(p.complaint_id)); },

    updateComplaint: function(p,s){
      need(s,'complaint.update');
      var r = find(p.complaint_id), n = 0;
      ['customer_name','customer_mobile','order_number','purchase_date','chair_type','purchase_source',
       'complaint_type','description','invoice_generated_by','priority','assigned_to','department',
       'action_taken','resolution'].forEach(function(f){
        if (p[f] === undefined) return;
        if (String(r[f]) !== String(p[f])) {
          hist(r.complaint_id, new Date(), s.email, s.role, 'Complaint Updated', f, r[f], p[f], p.remarks||'');
          r[f] = p[f]; n++;
        }
      });
      if (n){ r.updated_at = iso(new Date()); r.updated_by = s.email; }
      return ok({ complaint_id:r.complaint_id, changed:n });
    },

    assignComplaint: function(p,s){
      need(s,'complaint.assign');
      var r = find(p.complaint_id), before = r.assigned_to;
      r.assigned_to = String(p.assigned_to).toLowerCase();
      if (p.department) r.department = p.department;
      if (CLOSED.indexOf(r.status) === -1) r.status = 'Assigned';
      r.updated_at = iso(new Date()); r.updated_by = s.email;
      hist(r.complaint_id, new Date(), s.email, s.role, 'Complaint Assigned', 'assigned_to', before, r.assigned_to, p.remarks||'');
      return ok({ complaint_id:r.complaint_id, assigned_to:r.assigned_to });
    },

    verifyWarranty: function(p,s){
      need(s,'warranty.verify');
      if (WARRANTY_STATUSES.indexOf(p.warranty_status) === -1) throw { code:'VALIDATION_FAILED', message:'Invalid warranty status.' };
      var r = find(p.complaint_id), before = r.warranty_status, beforeStatus = r.status;
      r.warranty_status = p.warranty_status;
      r.warranty_verified_by = s.email;
      r.warranty_verified_at = iso(new Date());
      r.warranty_remarks = p.warranty_remarks || '';

      if (p.warranty_status === 'Out of Warranty') {
        var amt = Number(p.payment_amount||0);
        if (p.payment_required || amt > 0) {
          if (!(amt > 0)) throw { code:'VALIDATION_FAILED', message:'Enter the service amount to charge the customer.' };
          r.payment_required='TRUE'; r.payment_status='Pending'; r.payment_amount=amt; r.status='Awaiting Payment';
        } else { r.status = 'Assigned'; }
      } else if (p.warranty_status === 'Under Warranty') {
        r.payment_required='FALSE'; r.payment_status='Not Required'; r.status='Assigned';
      } else { r.status = 'Warranty Check'; }

      r.updated_at = iso(new Date()); r.updated_by = s.email;
      hist(r.complaint_id, new Date(), s.email, s.role, 'Warranty Verified', 'warranty_status', before, p.warranty_status, r.warranty_remarks);
      if (r.payment_amount && p.warranty_status === 'Out of Warranty') {
        hist(r.complaint_id, new Date(), s.email, s.role, 'Payment Required', 'payment_amount', '', '₹'+r.payment_amount, 'Out-of-warranty paid service');
      }
      if (r.status !== beforeStatus) hist(r.complaint_id, new Date(), s.email, s.role, 'Status Changed', 'status', beforeStatus, r.status, '');
      return ok({ complaint_id:r.complaint_id, warranty_status:r.warranty_status, status:r.status });
    },

    recordPayment: function(p,s){
      need(s,'payment.update');
      var amount = Number(p.amount);
      if (!(amount>0)) throw { code:'VALIDATION_FAILED', message:'Payment amount must be greater than zero.' };
      if (PAYMENT_MODES.indexOf(p.payment_mode) === -1) throw { code:'VALIDATION_FAILED', message:'Choose a payment mode.' };
      var r = find(p.complaint_id);
      if (p.reference_id) {
        var clash = PAYMENTS.filter(function(x){ return x.reference_id && x.reference_id === p.reference_id; })[0];
        if (clash) throw { code:'DUPLICATE_PAYMENT', message:'Transaction reference ' + p.reference_id + ' is already recorded against ' + clash.complaint_id + '.' };
      }
      var pay = { payment_id:uid('PAY'), complaint_id:r.complaint_id, amount:amount,
        payment_date:p.payment_date, payment_mode:p.payment_mode, reference_id:p.reference_id||'',
        proof_file:(p.proof_file||[]).map(function(f){ return { id:uid('FILE'), name:f.name, url:'#demo-file', size:f.size||0 }; }),
        collected_by:s.email, verified_by:'', verification_status:'Pending',
        remarks:p.remarks||'', created_at:iso(new Date()) };
      PAYMENTS.push(pay);
      var before = r.payment_collected;
      r.payment_collected = Number(r.payment_collected||0) + amount;
      r.payment_required = 'TRUE';
      r.payment_status = 'Collected';
      if (!r.payment_amount) r.payment_amount = amount;
      r.status = 'Payment Verification';
      r.updated_at = iso(new Date()); r.updated_by = s.email;
      hist(r.complaint_id, new Date(), s.email, s.role, 'Payment Recorded', 'payment_collected', before, r.payment_collected,
        p.payment_mode + (p.reference_id ? ' · ref ' + p.reference_id : ''));
      return ok({ payment_id:pay.payment_id, collected:r.payment_collected });
    },

    verifyPayment: function(p,s){
      need(s,'payment.verify');
      var pay = PAYMENTS.filter(function(x){ return x.payment_id === p.payment_id; })[0];
      if (!pay) throw { code:'NOT_FOUND', message:'Payment not found.' };
      pay.verification_status = p.verification_status;
      pay.verified_by = s.email;
      var r = find(pay.complaint_id);
      r.payment_status = p.verification_status === 'Verified' ? 'Verified' : p.verification_status;
      if (p.verification_status === 'Verified') r.status = 'In Progress';
      r.updated_at = iso(new Date()); r.updated_by = s.email;
      hist(r.complaint_id, new Date(), s.email, s.role, 'Payment ' + p.verification_status, 'payment_status', 'Collected', p.verification_status, p.remarks||'');
      return ok({ payment_id:pay.payment_id, verification_status:pay.verification_status });
    },

    updateStatus: function(p,s){
      need(s,'complaint.update');
      if (STATUSES.indexOf(p.status) === -1) throw { code:'VALIDATION_FAILED', message:'Unknown status.' };
      var r = find(p.complaint_id), before = r.status;
      var allowed = TRANSITIONS[before] || STATUSES;
      if (before !== p.status && allowed.indexOf(p.status) === -1 && !can(s,'*')) {
        throw { code:'INVALID_TRANSITION', message:'Cannot move a complaint from "' + before + '" to "' + p.status + '".',
                details:{ allowed:allowed } };
      }
      if ((p.status === 'Closed' || p.status === 'Resolved') && r.payment_status === 'Pending') {
        throw { code:'PAYMENT_PENDING', message:'Collect and verify the pending payment before closing this complaint.' };
      }
      r.status = p.status;
      if (p.action_taken) r.action_taken = p.action_taken;
      if (p.resolution) r.resolution = p.resolution;
      if ((p.status === 'Resolved' || p.status === 'Closed') && !r.resolution_date) {
        r.resolution_date = iso(new Date());
        r.tat_hours = hoursBetween(r.created_at, new Date());
      }
      if (p.status === 'Closed') { r.closed_at = iso(new Date()); if (p.customer_confirmed) r.customer_confirmed = 'TRUE'; }
      if (p.status === 'In Progress' && CLOSED.indexOf(before) !== -1) {
        r.reopened_count = Number(r.reopened_count||0) + 1; r.closed_at = '';
      }
      r.updated_at = iso(new Date()); r.updated_by = s.email;
      hist(r.complaint_id, new Date(), s.email, s.role, 'Status Changed', 'status', before, p.status, p.remarks||'');
      return ok({ complaint_id:r.complaint_id, status:r.status, tat_hours:r.tat_hours });
    },

    confirmByCustomer: function(p,s){
      need(s,'complaint.update');
      var r = find(p.complaint_id), before = r.status;
      r.customer_confirmed='TRUE'; r.status='Closed'; r.closed_at=iso(new Date());
      if (!r.resolution_date){ r.resolution_date = iso(new Date()); r.tat_hours = hoursBetween(r.created_at, new Date()); }
      r.updated_at = iso(new Date()); r.updated_by = s.email;
      hist(r.complaint_id, new Date(), s.email, s.role, 'Customer Confirmed Resolution', 'customer_confirmed','FALSE','TRUE', p.remarks||'');
      hist(r.complaint_id, new Date(), s.email, s.role, 'Complaint Closed', 'status', before, 'Closed', '');
      return ok({ complaint_id:r.complaint_id, status:'Closed' });
    },

    uploadFiles: function(p,s){
      need(s,'complaint.update');
      var r = find(p.complaint_id);
      var field = p.category === 'Complaint Evidence' ? 'evidence_files' : (p.category === 'Invoices' ? 'invoice_files' : null);
      var saved = (p.files||[]).map(function(f){ return { id:uid('FILE'), name:f.name, url:'#demo-file', size:f.size||0 }; });
      if (field) r[field] = (r[field]||[]).concat(saved);
      hist(r.complaint_id, new Date(), s.email, s.role, 'Files Attached', p.category, '', saved.length + ' file(s)', '');
      return ok({ files:saved });
    },

    dashboard: function(p,s){
      need(s,'dashboard.view');
      var rows = scope(s, COMPLAINTS.filter(function(r){ return r.is_deleted !== 'TRUE'; }));
      if (p.date_from){ var fr = new Date(p.date_from).getTime(); rows = rows.filter(function(r){ return new Date(r.created_at).getTime() >= fr; }); }
      if (p.date_to){ var to = new Date(p.date_to).getTime()+86399000; rows = rows.filter(function(r){ return new Date(r.created_at).getTime() <= to; }); }
      return ok(computeMetrics(rows));
    },

    export: function(p,s){ need(s,'export.data'); p.all = true; return ROUTES.listComplaints(p,s); },

    listEmployees: function(p,s){
      need(s,'employee.read');
      return ok(EMPLOYEES.map(function(e){
        var mine = COMPLAINTS.filter(function(c){ return c.assigned_to === e.email; });
        return { employee_id:e.employee_id, name:e.name, email:e.email, role:e.role, department:e.department,
                 active:e.active, assigned:mine.length,
                 resolved:mine.filter(function(c){ return CLOSED.indexOf(c.status) !== -1; }).length };
      }));
    },

    saveEmployee: function(p,s){
      need(s,'employee.manage');
      var existing = EMPLOYEES.filter(function(e){ return e.email.toLowerCase() === String(p.email).toLowerCase(); })[0];
      if (existing){
        existing.name = p.name; existing.role = p.role; existing.department = p.department;
        if (p.active === false) existing.active = 'FALSE';
        return ok({ employee_id:existing.employee_id, updated:true });
      }
      var rec = { employee_id:uid('EMP'), name:p.name, email:String(p.email).toLowerCase(),
                  role:p.role, department:p.department||'Customer Support', active:'TRUE' };
      EMPLOYEES.push(rec);
      return ok({ employee_id:rec.employee_id, created:true });
    }
  };

  var PUBLIC = ['ping','login'];

  window.DEMO = {
    enabled: true,
    /** Same contract as the live API: resolves with the envelope, never throws. */
    handle: function (params) {
      return new Promise(function (resolve) {
        // A little latency keeps the loading states honest.
        setTimeout(function () {
          try {
            var route = ROUTES[params.action];
            if (!route) return resolve(fail('UNKNOWN_ACTION','Unknown action: ' + params.action));
            var session = null;
            if (PUBLIC.indexOf(params.action) === -1) {
              session = SESSIONS[params.token];
              if (!session) return resolve(fail('SESSION_EXPIRED','Your session has expired. Please sign in again.'));
              session.permissions = PERMISSIONS[session.role] || [];
            }
            var out = route(params, session);
            out.meta = out.meta || {};
            out.meta.demo = true;
            resolve(out);
          } catch (e) {
            resolve(e && e.code ? fail(e.code, e.message, e.details)
                                : fail('INTERNAL_ERROR', String(e && e.message || e)));
          }
        }, 120 + Math.random() * 180);
      });
    }
  };
})();
