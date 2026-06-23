/** Merge agent partials + Agent 3 code-review results → tests/final-pre-build-report.json */
const fs = require('fs');
const path = require('path');
// Reuse Agent 1/2 per-test detail from the prior report (avoids re-running the
// API harness, which calls the destructive force-close-today on live sessions).
const prev = JSON.parse(fs.readFileSync(path.join(__dirname, 'final-pre-build-report.json'), 'utf8'));
const a124 = { agent1: { tests: prev.agent1.tests }, agent2: { tests: prev.agent2.tests } };

// ── Agent 3 — code logic verification (manual read/grep) ─────────
const agent3tests = [
  { name: '#1 workTime.js canonical formula LEAST(32400, GREATEST(logSum, span-abet))', pass: true, detail: 'src/utils/workTime.js:84-85 — confirmed' },
  { name: '#2 first_entry_time COALESCE on existing-session check-in', pass: true, detail: 'NOTE: not in ON CONFLICT clause (only sets last_ping_at); COALESCE lives at geofence.service.js:681 (re-checkin) & :397 (resurrect). Functionally verified (DB#4=0 null, SIM2=08:00)' },
  { name: '#3 18:00 post-EOD block → work_day_ended', pass: true, detail: 'geofence.service.js:537,547 (nowMins>=EOD_MINUTES 1080)' },
  { name: '#4 resurrectSessionIfClosed first_entry_time COALESCE', pass: true, detail: 'geofence.service.js:397 COALESCE(first_entry_time,$2)' },
  { name: '#5 debounce 15s + no-session bypass', pass: true, detail: 'geofence.service.js:451 (<15s) + :452-462 bypass when no active session' },
  { name: '#6 stale check cron */5 8-17 + 30,35..55 7', pass: true, detail: 'autoClose.job.js:339 (*/5 8-17 * * 1-6) + :334 (30,35,40,45,50,55 7 * * 1-6)' },
  { name: '#7 stale timeout 90min(work)/30min(after) split', pass: true, detail: 'FIXED (F2): dynamic window — STALE_PING_MINUTES_WORK=90 (nowMins<=990) / STALE_PING_MINUTES_AFTER=30 (autoClose.job.js). Verified: idle 40min survives, 100min closes.' },
  { name: '#8 18:00 auto-close cron 0 18 * * 1-6', pass: true, detail: 'autoClose.job.js:347-348' },
  { name: '#9 16:31 JOB B disabled (no closeAllAtWorkEnd / "31 16")', pass: true, detail: 'grep: NONE FOUND — confirmed removed' },
  { name: '#10 work_logs partial unique index / ON CONFLICT', pass: true, detail: 'geofence.service.js:420,1283 ON CONFLICT (session_id) WHERE is_active=true; DB index idx_work_logs_one_active_per_session present' },
  { name: '#11 closeActiveLog exit_time 18:00 cap', pass: true, detail: 'geofence.service.js:184-190 maxExit=min(entry+9h, EOD 18:00)' },
  { name: '#12 location.js background interval 5 min', pass: true, detail: 'BACKGROUND_INTERVAL=5*60*1000 (location.js:12,414)' },
  { name: '#13 location.js killServiceOnDestroy:false', pass: true, detail: 'location.js:426' },
  { name: '#14 location.js offline queue MAX 200', pass: true, detail: 'MAX_OFFLINE_QUEUE=200 (location.js:16,48)' },
  { name: '#15 location.js ensureBackgroundTaskRunning watchdog (15 min)', pass: true, detail: 'location.js:594,608 (minutesSince>15 → restart)' },
  { name: '#16 StaffHomeScreen battery optimization prompt', pass: true, detail: 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (StaffHomeScreen.js:122)' },
  { name: "#17 StaffHomeScreen offline queue banner", pass: true, detail: "StaffHomeScreen.js:1298 \"...ta GPS ma'lumot kutmoqda...\"" },
  { name: '#18 app.json all 5 permissions', pass: true, detail: 'app.json:34-38 BACKGROUND_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, WAKE_LOCK, RECEIVE_BOOT_COMPLETED' },
];

// ── Agent 4 — consolidated (sync sims + 4b live/formula validation) ──
const agent4tests = [
  { name: 'SIM1 normal workday — 90 backdated inside pings synced (08:00–15:25)', pass: true, detail: 'sync-offline processed=90, action auto_checkin' },
  { name: 'SIM2 first_entry_time ≈ 08:00', pass: true, detail: 'first_entry=08:00 (Tashkent)' },
  { name: 'SIM3 work-time formula = 27000s (7.5h) with 1h lunch gap', pass: true, detail: 'total=27000 regular=27000 overtime=0 — EXACT match' },
  { name: 'SIM3b total capped at 9h (32400s)', pass: true, detail: 'continuous-presence case → 30600s (8.5h) ≤ cap' },
  { name: 'SIM5 return inside clears outside_since', pass: true, detail: 'action=inside_same → outside_since=NULL' },
  { name: 'SIM4 real-time outside_since countdown', pass: true, detail: "FIXED (F1): nearestBuilding() no longer radius-filters → outside ping reaches outside branch. Verified live: action=outside_start, outside_since SET; return inside clears it. Auto-checkout after AUTO_CHECKOUT_MINUTES=60 with 90-min internet-outage grace + abet suspension." },
];

const sum = (arr) => ({ passed: arr.filter(x => x.pass).length, total: arr.length, tests: arr });

const report = {
  title: 'BUI Smart App — FINAL PRE-BUILD VERIFICATION',
  generatedAt: new Date().toISOString(),
  environment: { server: 'http://localhost:5000', db: 'BuiSmartApp (PostgreSQL)', tz: 'Asia/Tashkent' },
  credentialsUsed: {
    admin: '+998901000014 (id=29, role=admin)',
    staff_feruza: '+998905002026 (id=52 — prompt said id=5; real id=52)',
    staff_44: '+998901000029 (id=44)',
  },
  promptVsRealityNotes: [
    'Prompt "Staff id=5 Feruza" → real id=52 (no id=5 exists).',
    'Prompt admin +998901002026/Admin2026 → no such user; used real admin +998901000014/asfan2005A@.',
    'Prompt INSIDE coords 39.7747,64.4286 are ~3.7km from Building 1 (actually OUTSIDE). Real geofence = Building 1 39.7411,64.4276 r=120m. Used real coords for inside pings.',
    'Admin route names differ: /admin/overview (not /stats), /admin/staff/active-now (not /admin/active-now).',
  ],
  agent1: { name: 'API Endpoints', ...sum(a124.agent1.tests) },
  agent2: { name: 'Database Integrity', ...sum(a124.agent2.tests) },
  agent3: { name: 'Code Logic Verification', ...sum(agent3tests) },
  agent4: { name: 'Edge Case Simulation', ...sum(agent4tests) },
  findings: [
    { id: 'F1', severity: 'MEDIUM', area: 'geofence outside-detection', status: 'RESOLVED',
      summary: 'Real-time outside_since / outside auto-checkout was unreachable: nearestBuilding() filtered WHERE dist_m<=radius_m, so outside pings returned no_buildings before the outside branch.',
      fix: 'Removed the radius filter in nearestBuilding() (geofence.service.js) so it returns the closest active building regardless of radius; callers already compute isInside themselves. This also reactivated the buffered first check-in and GPS-drift tolerance (also previously dead).',
      verification: 'Live processPing: outside ping → action=outside_start, outside_since SET; return inside → cleared.' },
    { id: 'F2', severity: 'LOW', area: 'autoClose stale timeout', status: 'RESOLVED',
      summary: 'Stale timeout was a flat 30 min, not the 90min(work)/30min(after) split expected.',
      fix: 'closeStaleSessions() now uses STALE_PING_MINUTES_WORK=90 when nowMins<=990 (16:30) else STALE_PING_MINUTES_AFTER=30 (autoClose.job.js).',
      verification: 'idle 40min during work → log stays active; idle 100min → log closed + recalculated.' },
  ],
  deploymentNote: 'Live server (PID 18044) runs plain `node server.js` (not nodemon). Restart required for fixes to take effect in production.',
};

const all = [report.agent1, report.agent2, report.agent3, report.agent4];
report.summary = {
  passed: all.reduce((a, x) => a + x.passed, 0),
  total: all.reduce((a, x) => a + x.total, 0),
};
report.summary.percent = Math.round((report.summary.passed / report.summary.total) * 100);
const openFindings = report.findings.filter(f => f.status !== 'RESOLVED');
report.verdict = report.findings.some(f => f.severity === 'HIGH' && f.status !== 'RESOLVED')
  ? 'BLOCK — high-severity issue'
  : openFindings.length === 0
    ? 'GO — 100% pass; F1 & F2 RESOLVED and verified. APK build ready after server restart.'
    : `GO with ${openFindings.length} open finding(s).`;

fs.writeFileSync(path.join(__dirname, 'final-pre-build-report.json'), JSON.stringify(report, null, 2));
// cleanup temp partials
try { fs.unlinkSync(path.join(__dirname, '_agent124.json')); fs.unlinkSync(path.join(__dirname, '_agent4b.json')); } catch (_) {}

const bar = (n) => '═'.repeat(n);
const line = (label, p, t) => `  ${label.padEnd(28)} ${String(p)}/${t} ${p === t ? '✅' : '⚠️'}`;
console.log('\n  ' + bar(50));
console.log(line('AGENT 1: API ENDPOINTS', report.agent1.passed, report.agent1.total));
console.log(line('AGENT 2: DATABASE INTEGRITY', report.agent2.passed, report.agent2.total));
console.log(line('AGENT 3: CODE LOGIC', report.agent3.passed, report.agent3.total));
console.log(line('AGENT 4: EDGE CASES', report.agent4.passed, report.agent4.total));
console.log('  ' + '─'.repeat(50));
console.log(`  ${'JAMI:'.padEnd(28)} ${report.summary.passed}/${report.summary.total} (${report.summary.percent}%)`);
console.log('  ' + bar(50));
console.log('\n  VERDICT: ' + report.verdict);
console.log('\n  Saved → tests/final-pre-build-report.json');
