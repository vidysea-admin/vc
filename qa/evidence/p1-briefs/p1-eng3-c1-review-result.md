# Senior review result: eng3 fix cycle 1 (559a421..0cc886c), 2026-10-19

VERDICT: Block. One high recall regression.

- High (recall): crisis.ts ~655-674 matchPointContinuing fires only when nothing follows or the next word is in a 17-word allow-list, and `going on|continuing` was removed from the plain patterns (~142-143). Base was crisis, 0cc886c is none for: "I don't see the point in going on at all / without her / feeling like this / , nothing matters / everything is pointless / today / here / in this world / . Please help / my family would be better off / lol / with things", "I don't see the point in continuing to live"; "...going on when nobody cares" is now concern. Fix: invert. Suppress only on a study-object lead-in, fire on everything else; living/life/live always fire.
- Low (not a regression): "kill1 myself" is none at base and at 0cc886c (the 1->l view makes "killl").
- Sound: the kms rule (closes ISS-p1eng3-1), foldLeet and the 1->l view are additive, no ReDoS (inputs of 80-120k chars took under 60 ms), the marna regex is linear, tests are additions only, and the apps/api test input change is legitimate.
- Checks: engine guard-crisis + crisis-defaults 401/401; api anonymous-zero-persistence 27/27. Probes are in scratchpad/eng3c1rev/.
- Test gap: no positive test for "point in going on" followed by a word outside the allow-list.
