# Senior review result — p1/iss135 @ 6f025b6: APPROVE (security)
Real-socket probe: 65536 chunked → 200; 65537 → 413; streamed 1.1 MiB → 413; gzip header 70 KB → 413. Every 413 carries 14416 (anonymous.ts:406,:409 via fail()). Crisis-before-limiter intact (anonymous.ts:426-429). Byte-counted cap (server.ts:854-880).
Lows: (1) anonymous-fixtures.ts:164 readBody ignores maxBytes, so the streaming reject at the 64 KiB boundary is untested in-suite — add a createApiServer boundary test (65536→200, 65537→413). (2) server.ts:863 req.resume() drains post-413 without limit until request timeout (pre-existing; proxy/server timeout).
Open: chat.ts:111-112 MAX_CHAT_BODY_BYTES 256 KiB — check whether the authenticated chat route's crisis scan also precedes its limiter (same ISS-135 class).
