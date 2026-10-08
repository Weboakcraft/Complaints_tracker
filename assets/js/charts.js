/* ============================================================
   charts.js — dependency-free SVG charts.

   Categorical palette is fixed in order and never cycled; it was validated
   for lightness band, chroma floor, CVD separation (worst adjacent ΔE 8.8),
   normal-vision separation and contrast, against both the light and the dark
   chart surface. A 7th category folds into "Other" rather than inventing a hue.

   Single-measure charts use one hue (magnitude, not identity) and carry no
   legend — the title names the series. Multi-series charts always carry a
   legend, so identity is never colour-alone.
   ============================================================ */
window.Charts = (function () {
  'use strict';

  var CAT = ['#2563c7', '#c77a0f', '#0e9aa7', '#c2410c', '#1a8f62', '#a63fa0'];
  var OTHER = '#8b8176';
  var SEQ = '#2563c7';          // single-measure hue
  var SEQ_SOFT = 'rgba(37,99,199,.14)';

  function esc(s) { return UI.esc(s); }

  /** Fold anything past the 6th slot into "Other". */
  function fold(items, max) {
    max = max || 6;
    if (items.length <= max) return items.slice();
    var head = items.slice(0, max - 1);
    var tail = items.slice(max - 1);
    head.push({
      label: 'Other (' + tail.length + ')',
      total: tail.reduce(function (s, x) { return s + x.total; }, 0),
      resolved: tail.reduce(function (s, x) { return s + x.resolved; }, 0),
      isOther: true
    });
    return head;
  }

  function colorAt(i, item) { return item && item.isOther ? OTHER : CAT[i % CAT.length]; }

  /* ---------------------------------------------------------- *
   * Donut — composition of a whole (purchase source, warranty mix)
   * ---------------------------------------------------------- */
  function donut(items, opts) {
    opts = opts || {};
    items = fold(items.filter(function (i) { return i.total > 0; }));
    var total = items.reduce(function (s, i) { return s + i.total; }, 0);
    if (!total) return emptyState(opts.emptyText || 'No complaints in this range.');

    var size = 190, r = 74, cx = size / 2, cy = size / 2, sw = 26;
    var circ = 2 * Math.PI * r;
    var offset = 0, arcs = '';

    items.forEach(function (it, i) {
      var frac = it.total / total;
      var len = frac * circ;
      // 2px surface gap between adjacent segments.
      var gap = items.length > 1 ? 2 : 0;
      arcs += '<circle class="seg" data-i="' + i + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"' +
        ' fill="none" stroke="' + colorAt(i, it) + '" stroke-width="' + sw + '"' +
        ' stroke-dasharray="' + Math.max(0, len - gap) + ' ' + (circ - Math.max(0, len - gap)) + '"' +
        ' stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
        '<title>' + esc(it.label) + ': ' + UI.fmtNum(it.total) + ' (' + Math.round(frac * 100) + '%)</title></circle>';
      offset += len;
    });

    var headline = opts.centerValue !== undefined ? opts.centerValue : UI.fmtNum(total);
    var caption = opts.centerLabel || 'complaints';

    var svg =
      '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' +
        esc(opts.aria || 'Distribution donut chart') + '" style="max-width:' + size + 'px;margin:0 auto">' +
        arcs +
        '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" style="font:600 25px var(--display);fill:var(--ink)">' + esc(headline) + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase">' + esc(caption) + '</text>' +
      '</svg>';

    return svg + legend(items, total);
  }

  function legend(items, total) {
    return '<div class="legend">' + items.map(function (it, i) {
      return '<span><i style="background:' + colorAt(i, it) + '"></i>' + esc(it.label) +
             ' <b>' + UI.fmtNum(it.total) + '</b>' +
             (total ? ' <span class="muted">' + Math.round((it.total / total) * 100) + '%</span>' : '') +
             '</span>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------- *
   * Ranked bars — magnitude across one dimension.
   * One hue, direct value labels, resolution rate as a sub-line.
   * ---------------------------------------------------------- */
  function ranked(items, opts) {
    opts = opts || {};
    if (!items.length) return emptyState(opts.emptyText || 'Nothing to rank yet.');
    var max = Math.max.apply(null, items.map(function (i) { return i.total; })) || 1;

    return '<div class="ranklist">' + items.slice(0, opts.limit || 8).map(function (it) {
      var w = Math.max(2, (it.total / max) * 100);
      return '<div class="rank">' +
        '<span class="truncate" title="' + esc(it.label) + '">' + esc(it.label) + '</span>' +
        '<span class="num"><b>' + UI.fmtNum(it.total) + '</b></span>' +
        '<span class="rank__bar"><i style="width:' + w + '%;background:' + (opts.color || SEQ) + '"></i></span>' +
        '<span class="rank__meta">' + (it.resolution_pct !== undefined ? it.resolution_pct + '% resolved' : '') + '</span>' +
        '<span class="rank__meta num">' + (it.pending !== undefined ? UI.fmtNum(it.pending) + ' open' : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------- *
   * Trend — complaints received vs resolved per day.
   * Two series, so: legend present, 2px lines, hover crosshair.
   * ---------------------------------------------------------- */
  function trend(points, opts) {
    opts = opts || {};
    if (!points || points.length < 2) return emptyState('Not enough days of data to draw a trend yet.');

    var W = 720, H = 236, padL = 34, padR = 14, padT = 14, padB = 28;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var maxY = Math.max(1, Math.max.apply(null, points.map(function (p) { return Math.max(p.total, p.resolved); })));
    var niceMax = niceCeil(maxY);

    var x = function (i) { return padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW); };
    var y = function (v) { return padT + innerH - (v / niceMax) * innerH; };

    var gridlines = '', ticks = 4;
    for (var g = 0; g <= ticks; g++) {
      var v = (niceMax / ticks) * g, yy = y(v);
      gridlines += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy + '" y2="' + yy + '" class="axis" opacity="' + (g === 0 ? 1 : .55) + '"/>' +
                   '<text x="' + (padL - 7) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + Math.round(v) + '</text>';
    }

    var line = function (key) {
      return points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1); }).join(' ');
    };
    var area = 'M' + x(0).toFixed(1) + ' ' + y(0) + ' ' +
      points.map(function (p, i) { return 'L' + x(i).toFixed(1) + ' ' + y(p.total).toFixed(1); }).join(' ') +
      ' L' + x(points.length - 1).toFixed(1) + ' ' + y(0) + ' Z';

    // Date labels: first, middle, last only — never one per point.
    var labels = '';
    [0, Math.floor(points.length / 2), points.length - 1].forEach(function (i, n) {
      var anchor = n === 0 ? 'start' : (n === 2 ? 'end' : 'middle');
      labels += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' +
                esc(shortDate(points[i].label)) + '</text>';
    });

    // Invisible hit columns drive the tooltip; targets are wider than the marks.
    var hits = points.map(function (p, i) {
      var w = innerW / points.length;
      return '<rect class="hit" x="' + (x(i) - w / 2).toFixed(1) + '" y="' + padT + '" width="' + w.toFixed(1) + '" height="' + innerH + '"' +
        ' fill="transparent" data-i="' + i + '" data-label="' + esc(p.label) + '"' +
        ' data-total="' + p.total + '" data-resolved="' + p.resolved + '" data-x="' + x(i).toFixed(1) + '"/>';
    }).join('');

    var dots = points.map(function (p, i) {
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.total).toFixed(1) + '" r="2.6" fill="' + CAT[0] + '" opacity=".85"/>';
    }).join('');

    var id = 'tr' + Math.random().toString(36).slice(2, 7);

    return '<div class="trendwrap" style="position:relative" data-chart="' + id + '">' +
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:236px" role="img" aria-label="Complaints received and resolved per day">' +
        gridlines +
        '<path d="' + area + '" fill="' + SEQ_SOFT + '"/>' +
        '<path d="' + line('total') + '" fill="none" stroke="' + CAT[0] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<path d="' + line('resolved') + '" fill="none" stroke="' + CAT[4] + '" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>' +
        dots + labels +
        '<line class="crosshair" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + innerH) + '" stroke="var(--ink-3)" stroke-width="1" opacity="0"/>' +
        hits +
      '</svg>' +
      '<div class="tip" style="position:absolute;pointer-events:none;opacity:0;transform:translate(-50%,-115%);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:7px 10px;font-size:12.2px;box-shadow:var(--shadow);white-space:nowrap;z-index:5"></div>' +
      '<div class="legend">' +
        '<span><i style="background:' + CAT[0] + '"></i>Received</span>' +
        '<span><i style="background:' + CAT[4] + '"></i>Resolved</span>' +
      '</div>' +
    '</div>';
  }

  /** Wire hover on any trend charts inside a container. */
  function bindTrend(root) {
    (root || document).querySelectorAll('[data-chart]').forEach(function (wrap) {
      var svg = wrap.querySelector('svg');
      var tip = wrap.querySelector('.tip');
      var cross = wrap.querySelector('.crosshair');
      if (!svg || !tip) return;

      svg.addEventListener('mousemove', function (e) {
        var hit = e.target.closest ? e.target.closest('.hit') : null;
        if (!hit) return;
        var box = wrap.getBoundingClientRect();
        var vb = svg.viewBox.baseVal;
        var scale = box.width / vb.width;
        var px = Number(hit.dataset.x) * scale;
        cross.setAttribute('x1', hit.dataset.x);
        cross.setAttribute('x2', hit.dataset.x);
        cross.setAttribute('opacity', '.4');
        tip.innerHTML = '<strong>' + esc(longDate(hit.dataset.label)) + '</strong><br>' +
          'Received <b>' + hit.dataset.total + '</b> · Resolved <b>' + hit.dataset.resolved + '</b>';
        tip.style.left = px + 'px';
        tip.style.top = '36px';
        tip.style.opacity = '1';
      });
      svg.addEventListener('mouseleave', function () {
        tip.style.opacity = '0';
        cross.setAttribute('opacity', '0');
      });
    });
  }

  /* ---------------------------------------------------------- *
   * Progress meter — a single proportion (resolution rate).
   * ---------------------------------------------------------- */
  function meter(value, opts) {
    opts = opts || {};
    var v = Math.max(0, Math.min(100, Number(value) || 0));
    var tone = opts.color || (v >= 80 ? '#1a8f62' : v >= 55 ? '#c77a0f' : '#c2410c');
    return '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="flex:1;height:8px;border-radius:999px;background:var(--paper-2);overflow:hidden">' +
        '<i style="display:block;height:100%;width:' + v + '%;background:' + tone + ';border-radius:999px"></i>' +
      '</div>' +
      '<strong style="font-variant-numeric:tabular-nums;font-size:14px">' + v + '%</strong>' +
    '</div>';
  }

  /* ---------------------------------------------------------- *
   * Stacked status bar — one row, all workflow states.
   * ---------------------------------------------------------- */
  function statusBar(items) {
    var total = items.reduce(function (s, i) { return s + i.total; }, 0);
    if (!total) return emptyState('No complaints in this range.');
    var folded = fold(items);
    var segs = folded.map(function (it, i) {
      return '<i title="' + esc(it.label) + ': ' + it.total + '" style="flex:' + it.total +
        ';background:' + colorAt(i, it) + ';min-width:3px"></i>';
    }).join('');
    return '<div style="display:flex;gap:2px;height:14px;border-radius:999px;overflow:hidden;background:var(--paper-2)">' +
      segs + '</div>' + legend(folded, total);
  }

  /* ---------------------------------------------------------- */
  function emptyState(text) {
    return '<div class="empty" style="padding:34px 12px"><p>' + esc(text) + '</p></div>';
  }

  function niceCeil(v) {
    if (v <= 5) return 5;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / (mag / 2)) * (mag / 2);
  }

  function shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  }
  function longDate(iso) { return UI.fmtDate(iso); }

  return {
    palette: CAT,
    donut: donut, ranked: ranked, trend: trend, bindTrend: bindTrend,
    meter: meter, statusBar: statusBar, legend: legend, fold: fold
  };
})();
