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
- Text steps only. This tool does not click, fill in or drive the host site.
- Crisis handling is unchanged: the crisis guard runs before this tool, so a distress message never reaches it.

## Output shape

`{ steps: ["Open the Careers page (/careers).", "Finally, open the Saved page (/careers/saved)."], routes: ["/careers", "/careers/saved"] }`
