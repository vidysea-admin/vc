# gl-c-health-route

Deploy readiness: the VC API has no health route (GET /health returns 404); load balancers / ECS / EKS need one. Add IN PLACE in the existing app/router file:
- GET /health: liveness, 200 {"status":"ok"}, no dependency calls, no auth, cheap.
- GET /ready: readiness, 200 {"status":"ready"} when a cheap Mongo ping on the virtual_counsellor client succeeds within about 1 s, else 503 {"status":"unavailable"}.
Never return hostnames, error text, env values or versions. Neither route needs a partner key, neither may be throttled into failure by the anonymous limiter, and neither logs bodies.
TDD: tests for 200, 503 on a failing ping (fake), no auth needed, body has no host/secret, unknown path still 404. Run the touched test file + main.test.ts + tsc --noEmit for apps/api via bash scripts/vc-testlock.sh.
