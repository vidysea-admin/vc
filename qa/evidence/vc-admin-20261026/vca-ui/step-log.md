# Admin UI browser walk (stub API smoke)

Base http://localhost:3118, stub http://127.0.0.1:3119. 34/34 steps passed. Console errors: 27.

| Role | Step | Expected | Observed | Result |
|---|---|---|---|---|
| anon | missing session redirects to login | GET /admin/dashboard with no cookie lands on /admin/login | landed on /admin/login | PASS |
| anon | wrong password shows the generic error | same sentence for a wrong password and an unknown email, no cookie set | both attempts: "Email or password is incorrect."; no session cookie | PASS |
| super-admin | login lands on the dashboard; cookie flags; no browser storage | HttpOnly + SameSite=Strict cookie, URL /admin/dashboard, storage empty | cookie HttpOnly=true SameSite=Strict Secure=false; localStorage and sessionStorage empty, no token in the URL, session cookie not readable by script | PASS |
| super-admin | dashboard shows every metric and the 50 INR target | all metric ids present, cost per student vs target | 7 per-site-day rows; cost status "Under target" (target 50 INR) | PASS |
| super-admin | Admins: create an admin, then set the role | new row appears, role change persists after reload | newbie@vc.test created as viewer, set to admin, still admin after reload | PASS |
| super-admin | Sources: set a secret; it never re-displays | state flips to 'set', the secret text is nowhere on the page, also after reload | 'not set' -> 'set'; secret text absent from the DOM after save and after reload; input cleared | PASS |
| super-admin | sign out returns to login and the cookie is gone | cookie cleared, /admin/dashboard redirects to login | signed out; protected page redirects to login | PASS |
| admin | login; no Admins nav; /admin/admins is denied | Admins link absent, page says super-admin only, no API call made for the list | no Admins link; denied note shown | PASS |
| admin | Sites: add a site with origins; both keys shown once | reveal panel with vck_pub_ and vck_srv_ keys; gone after reload | pub and srv keys shown, then absent from the DOM after reload (only the prefix remains) | PASS |
| admin | Keys: rotate shows a new key once; old prefix replaced | confirm step, new key panel, new key differs, gone after reload | rotated pub key shown once and gone after reload | PASS |
| admin | Keys: revoke then unrevoke | status badge revoked, rotate buttons gone; unrevoke restores | revoked (no rotate), unrevoked (active) | PASS |
| admin | Sources: add a GitHub source, Test, Sync | source appears; Test explains the missing secret; Sync reports ok | Test: "No secret is set for this source."; Sync: "Sync ok (files 42)"; no secret setter for admin | PASS |
| admin | stale role: a forced write returns 403 and the page shows it as an error | after the server downgrades the account, Add site shows 'not allowed' in an alert | banner: "You are not allowed to do that." | PASS |
| viewer | login -> Dashboard | metrics visible | dashboard rendered | PASS |
| viewer | lists visible, every write control absent or disabled | no add/revoke/test/sync/secret/create controls | sites, site detail and sources render their lists; zero enabled write controls | PASS |
| viewer | forced write call returns 403 | POST /sites through the proxy with the viewer's token -> 403 | HTTP 403 {"error":"forbidden"} | PASS |
| viewer | expired session returns to login | after the API invalidates every token, the next navigation lands on /admin/login | 401 from the API -> cookie cleared -> /admin/login | PASS |
| super-admin@360 | no horizontal scroll on /admin/dashboard | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| super-admin@360 | no horizontal scroll on /admin/sites | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| super-admin@360 | no horizontal scroll on /admin/sites/pathlynks | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| super-admin@360 | no horizontal scroll on /admin/sources | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| super-admin@360 | no horizontal scroll on /admin/audit | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| super-admin@360 | no horizontal scroll on /admin/admins | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| admin@360 | no horizontal scroll on /admin/dashboard | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| admin@360 | no horizontal scroll on /admin/sites | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| admin@360 | no horizontal scroll on /admin/sites/pathlynks | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| admin@360 | no horizontal scroll on /admin/sources | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| admin@360 | no horizontal scroll on /admin/audit | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| viewer@360 | no horizontal scroll on /admin/dashboard | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| viewer@360 | no horizontal scroll on /admin/sites | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| viewer@360 | no horizontal scroll on /admin/sites/pathlynks | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| viewer@360 | no horizontal scroll on /admin/sources | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| viewer@360 | no horizontal scroll on /admin/audit | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |
| anon@360 | login page has no horizontal scroll | scrollWidth <= clientWidth at 360 px | scrollWidth 360 <= clientWidth 360 | PASS |

- console error: http://localhost:3118/admin/login A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as 
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/sites Failed to load resource: the server responded with a status of 403 (Forbidden)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/sources Failed to load resource: the server responded with a status of 403 (Forbidden)
- console error: http://localhost:3118/admin/audit Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/audit Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console error: http://localhost:3118/admin/login Failed to load resource: the server responded with a status of 401 (Unauthorized)