---
name: vc-navigation
description: Use when a signed-in student asks where something is on the host site or how to get to a page - the navigate_steps tool turns the stored route catalogue into at most 7 text steps and never names a page that is not in it.
---

## Purpose

`navigate_steps` tells a student, in plain text, which pages to open to reach what they asked for (for example "where do I see my saved
careers?"). It reads the navigation catalogue that was built when the host site's repository was last synced (spec vc-admin-control S4/S6);
nothing is fetched from the host site or from GitHub while the student is chatting.

## Rules

- Steps come from the catalogue only: `navigateSteps(catalogue, intent) -> { steps: string[], routes: string[] }`, in order, at most 7.
- Every entry of `routes` is a path present in the catalogue. Never invent, guess, abbreviate or extend a path, and never produce an
  absolute URL, a `../` path or any other host.
- An intent that matches no catalogue page, or a missing or empty catalogue, gets the fixed text "I don't know that page yet" and no routes.
- Versioned recipes: `pathlynks-quest/2026-10-27.1`, grounded in the observed controls recorded in the T-057 plan. Career Selection (English, Hindi or Hinglish) targets `/career-quest/career-selection`: Top Picks For You → preview → Add to picks (maximum 5) → rank chosen picks. Career Compare targets `/career-compare`: Category → Subcategory → Career → at least 2 careers → Compare. A recipe is available only when its exact safe route is in the current catalogue; a missing task never falls back to the repository.
- `NavRoute.locked?: boolean` is an optional trusted host snapshot. A locked target or ancestor returns an explicit locked message and no route; conflicting duplicate entries fail closed. Missing metadata does not prove the page is unlocked: the current host action/lock resolver still controls access. The static ingest catalogue does not discover live progress or locks.
- Recipe steps are instructions for the student and do not assert existing picks, ranking, completion or other current selection state. The `{ steps, routes }` DTO stays unchanged; several recipe steps can share one route. Generic page navigation retains its existing prefix chain.
- Platform services (T-057): a catalogue route may carry `label` and `summary` (read from the host's copy at sync time). A question about a service ("do you help with loans?", "visa help", "test prep", "scholarship") returns one line `name: purpose (path)` for that route, with the relative path only. Name a service only if this tool returned it; never invent a service, a purpose or a link.
- Vidysea tools (tool-first T1, `vidysea-tool-first/2026-10-29.1`): a request for a Vidysea student tool returns one headline line `label: purpose (link)` and 3-6 numbered, reviewed steps. Recipes: AI University Finder, University Explorer ("best universities in <country>", "find universities"), Shortlisted, Compare, Journey Map, Application Status, Visa, Favourites, Scholarships, Document Vault, Test Requirements, Tools Library. The link is the recipe's own path plus `?section=<key>` where the key comes from a closed list (`SECTION_KEYS`: dashboard, market, journey, shortlisted, compare, comparisons, favourites, scholarships, schpipeline, applications, visa, tools, documents, docchecklist, testreq); a section, query or country typed by the student is never copied into a link. A recipe fires only if its base path is in the synced catalogue; otherwise the answer is the unknown text and the caller falls through to the KB.
- "Make my full journey": there is no single full-journey object. A journey map is built per programme: shortlist first, press Generate Journey Map on the programme card, confirm nationality and tests, wait 60-120 seconds; the bulk Generate on Shortlisted covers counsellor-verified programmes only. Never say the journey was made.
- "Best universities in <country>": University Explorer steps. The country is echoed only when exactly one country from the reviewed list is named and its `/country/<slug>` page is in the catalogue; otherwise the steps stay generic.
- Text steps only. This tool does not click, fill in or drive the host site.
- Crisis handling is unchanged: the crisis guard runs before this tool, so a distress message never reaches it.

## Output shape

`{ steps: ["Open the Careers page (/careers).", "Finally, open the Saved page (/careers/saved)."], routes: ["/careers", "/careers/saved"] }`
