# Checker A admin UI walk (real withAdminRoutes API + next dev)

| role | step | expected | observed | result |
|---|---|---|---|---|
| anon | no cookie -> /admin/dashboard lands on login | redirect | http://localhost:4520/admin/login | PASS |
| anon | wrong password and unknown e-mail show same generic error; no cookie | same text | "Email or password is incorrect." | PASS |
| anon | tampered session cookie redirects to login | redirect | landed on /admin/login | PASS |
| super-admin | login -> dashboard; cookie HttpOnly+SameSite; no storage | ok | HttpOnly=true SameSite=Strict Secure=false; localStorage/sessionStorage empty; URL and document.cookie hold no token | PASS |
| super-admin | dashboard tiles present | all tiles + per-site-day table | active-students=0; tokens=0; cost-per-student=0.00; latency-p50=0; latency-p95=0; guardrail=0; unanswered=0; chat=0; voice=0; cost-status=Under target; DEFAULT range(to=today) tokens=0; with To=tomorrow tokens=900 cps=1.70 rows=1 | PASS |
| super-admin | Admins: create admin, set role, persists after reload | ok | newbie created viewer->admin, persisted | PASS |
| super-admin | Sources: set secret; never re-displayed | ok | initial state | FAIL |
| super-admin | sign out clears cookie | ok | signed out | PASS |
| admin | login; no Admins link; /admin/admins denied | ok | denied page shown | PASS |
| admin | Sites: add site; keys shown once, gone after reload | ok | locator.waitFor: Timeout 30000ms exceeded. | FAIL |
| admin | Keys: rotate (confirm), revoke, unrevoke | ok | rotate shown once, revoke hides rotate, unrevoke restores | PASS |
| admin | Sources: add GitHub source, Test, Sync; no secret setter | ok | Test "Connection works." Sync "Sync ok (files 1, tables 1, diagnostics 1)" | PASS |
| admin | admin forced super-admin-only routes are 403 | 403 | {"list":403,"create":403,"secret":403} | PASS |
| viewer | login; lists visible; all write controls absent/disabled | ok | zero enabled write controls on sites, site detail, sources | PASS |
| viewer | forced writes through proxy: 403 for every write route | 403 | {"POST sites":403,"POST sources/gh-1/test":403,"POST sources/gh-1/sync":403,"POST sites/demo-college/revoke":403,"PUT sources/gh-1/secret":403,"POST admins":403} | PASS |
| viewer | cookie alone authorises nothing (no Authorization header) incl. a write | 401 | {"get":401,"post":401} | PASS |
| viewer | proxy hostile paths do not escape the admin API | no foreign 200 | {"..%2fme":400,"%2e%2e/%2e%2e/api/sessions":404,"http://evil.example/x":400,"//evil.example/x":404,"me%00":400} | PASS |
| super-admin@360 | no horizontal scroll /admin/dashboard | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| super-admin@360 | no horizontal scroll /admin/sites | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| super-admin@360 | no horizontal scroll /admin/sites/demo-college | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| super-admin@360 | no horizontal scroll /admin/sources | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| super-admin@360 | no horizontal scroll /admin/audit | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| super-admin@360 | no horizontal scroll /admin/admins | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| admin@360 | no horizontal scroll /admin/dashboard | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| admin@360 | no horizontal scroll /admin/sites | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| admin@360 | no horizontal scroll /admin/sites/demo-college | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| admin@360 | no horizontal scroll /admin/sources | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| admin@360 | no horizontal scroll /admin/audit | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| viewer@360 | no horizontal scroll /admin/dashboard | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| viewer@360 | no horizontal scroll /admin/sites | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| viewer@360 | no horizontal scroll /admin/sites/demo-college | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| viewer@360 | no horizontal scroll /admin/sources | scrollWidth<=clientWidth | 360 <= 360 | PASS |
| viewer@360 | no horizontal scroll /admin/audit | scrollWidth<=clientWidth | 360 <= 360 | PASS |
