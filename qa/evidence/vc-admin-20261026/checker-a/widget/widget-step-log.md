# Checker A widget walk (apps/widget stub-server, port 5191)

- PASS | 1280x800 open fits viewport | {"x":888,"y":156,"width":380,"height":560}
- PASS | 1280x800 drag past top-left clamps in viewport | {"x":0,"y":0,"width":380,"height":560}
- PASS | 1280x800 drag past bottom-right clamps in viewport | {"x":900,"y":240,"width":380,"height":560}
- PASS | 1280x800 resize small floors at 300x380 | {"w":300,"h":380}
- FAIL | 1280x800 chat/voice toggle | TimeoutError: locator.click: Timeout 30000ms exceeded.
- PASS | 1280x800 no localStorage/sessionStorage/cookies | {"l":[],"s":[],"c":""}
- PASS | 1280x800 pop-out URL carries only the site id | http://127.0.0.1:5191/vc-popout?site=demo
- PASS | 1280x800 no horizontal page scroll | true
- PASS | 360x640 open fits viewport | {"x":8,"y":20,"width":344,"height":540}
- PASS | 360x640 drag past top-left clamps in viewport | {"x":0,"y":0,"width":344,"height":540}
- PASS | 360x640 drag past bottom-right clamps in viewport | {"x":16,"y":100,"width":344,"height":540}
- PASS | 360x640 resize small floors at 300x380 | {"w":300,"h":380}
- FAIL | 360x640 chat/voice toggle | TimeoutError: locator.click: Timeout 30000ms exceeded.
- PASS | 360x640 no localStorage/sessionStorage/cookies | {"l":[],"s":[],"c":""}
- PASS | 360x640 pop-out URL carries only the site id | http://127.0.0.1:5191/vc-popout?site=demo
- PASS | 360x640 no horizontal page scroll | true
