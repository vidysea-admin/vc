# pc-partner-keys cycle-0 senior review: Warning (head cfb70c3)
Fold into fix cycle 1 if a checker FAILs; otherwise the mediums become fix-now rows before merge.
- [medium] partners.ts addPartner / index.ts partnerStoreRef: partnerId becomes tenantId; nothing stops a partner id equal to an existing JWT tenant -> server key could read that tenant's students. Fix: reserved/known-tenant deny check in addPartner (+ test).
- [medium] partners.ts:430-443 createPartnerRegistry partners(): a synchronous throw from store.list() leaves a rejected promise pinned in `inflight` forever (finally runs before ??= assigns). Fix: inflight = Promise.resolve().then(load).finally(() => { inflight = undefined; }) (+ test: list throws once then recovers).
- [low] partners.ts:21-23 header comment claims voice route is CORS-eligible; fix comment, record K4 deviation (pc-voice adds the route).
- [low] rotatePartner writes the whole keys object; $set keys.<scope> only.
- [low] nginx voice stream location: no limit_req; single-use token in query string lands in access log.
- [low] scripts/partner.ts:43 catch-all echoes driver error messages (possible URI fragment).
- Open: K1 field names vs keys.{pub,srv} (scope continuation in inbox, not in spec text); openapi.json keyless cross-origin gets no ACAO; keyed+keyless buckets give a client two limits.
