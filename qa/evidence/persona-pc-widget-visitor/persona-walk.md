# Persona walk: anonymous Vidysea-website visitor (key mode), pc-widget cycle 0
Driver: checker's own Chromium script (qa/evidence/browser-pc-widget-checker-c0/checker-browser.js), 360x640 touch, host page with hostile CSS, stub API on 5191.
Audience lenses: phone-width, mixed literacy (a student or parent on a phone), English UI. No expert-at-scale or non-English lens (none in the spec audience).
| screen | what they tried | what blocked them | severity |
|---|---|---|---|
| host page + bubble | found the bubble bottom right, tapped it | nothing; 56 px, purple per data-vc-color, visible despite hostile page CSS | none |
| open panel | read greeting, typed a question, Enter | nothing; focus lands in the textarea, 16 px font, Send 44 px | none |
| wait | sent a slow question | typing dots show, Send disabled | none |
| answer | read message, 2 claims, sources | the unverified claim is flagged "(unverified)"; the https source is a link, the non-URL source is plain text | none |
| long text | very long unbroken reply | wraps, no horizontal scroll | none |
| rate limit | sent too fast | "Please wait N s" counts down, message returned to the box, Send re-enabled after Retry-After | none |
| revoked key | message after the key was revoked | "Chat unavailable" and the box is disabled; no retry loop | low: no way to reopen the chat without a page reload (by design) |
| distress | typed a crisis message | red crisis block with 14416 / 112; footer always shows the same | none |
| reload | refreshed | conversation gone, greeting only (in-memory by design) | none |
No high finding.
