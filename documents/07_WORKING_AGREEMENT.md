# WORKING AGREEMENT — how the CEO works and what he expects

*Pål-Andre is the CEO and the only stakeholder. He is **not a developer**. He
directs, you build. This page exists so a new coder never has to make him
re-explain how he works. Everything here is drawn from what he has actually
said or done, with dates.*

---

## Who he is in this project

- He directs the product and makes the calls that are his to make (names,
  purchases, Apple logins, "which of these two looks better"). Everything
  else he has explicitly delegated: *"u are the expert, make the right
  decisions"* (2026-08-14).
- He tests on his **iPhone**, often on 5G away from home. That single fact
  drives the tunnel-only doctrine.
- He judges by **looking at it**. He catches wrapped labels, pop-in, ugly
  assets, jargon and wrong logos from screenshots, fast.
- He should never have to say "keep working". If he does, the process failed.

## What he asks for, in his words → what it means

| He says | He means |
|---|---|
| "give me the link" | the install link from `01_LINKS.md` |
| "the run app cmd thing" | `START-APP.cmd` |
| "it's broken / no metro stuff" | open `06_TROUBLESHOOTING.md` first — it has never once been the app code |
| "like Stride does it" | dev client + tunnel + live reload, launchers he double-clicks |
| "keep working on this project" | take the top of `AI_TODO.md` and run the loop; don't ask what to do |

## Hard product mandates (violating these is a fired offence)

1. **Never invent a game number.** Every figure is datamined or explicitly
   labelled community/wiki-measured, with provenance in `verification.json`.
   Special Cake override and Mushroom Cake IV bonus stay unmodelled.
2. **The engine is sacred.** `formula.ts` / `planner.ts` / `odds.ts` exist as
   identical copies in `app/` and `mobile/`. Change one → change both →
   oracle must pass. Never fork behaviour.
3. **Tunnel only** for the dev server. No LAN fallback, ever.
4. **Navigation is CEO-final** (2026-08-15) — side-panel domains, per-domain
   bottom tabs, Paldex always centre, Map fullscreen. Don't restructure
   without him.
5. **No emoji in app chrome.** Vector icons via `ui/Icon.tsx` or real game
   asset icons only.
6. **No jargon in user-visible copy.** "tie-break" was banned by name and had
   to be purged from five strings. Write what a player would say.
7. **The launchers are API.** `START-APP.cmd`, `PUSH-UPDATE.cmd`,
   `BUILD-DEV.cmd`, `COPY-INSTALL-LINK.cmd` must keep working exactly as
   `README-PHONE.md` describes. He double-clicks; he does not open terminals.
8. **One production file per concept.** No `X - Copy.ts`, no `.bak`. Use git.

## The work loop

1. **WORK** one item from `AI_TODO.md` (top down unless he redirects).
2. **VERIFY** — gates in `08_TOOLS_AND_COMMANDS.md`. No proof, not done.
3. **SELF-REVIEW** your own diff like a hostile senior engineer.
4. **RE-EVALUATE** the whole product; add everything you find to the queue.
   Finding nothing means you didn't look.
5. **UPDATE** the queue + docs, then take the next item.

Stop only for a genuine CEO-only blocker (Apple login, a purchase, a naming
decision, permission to publish). State it in **one plain sentence at the top**
of your reply. "I finished the task" is never a reason to stop.

## Verify with your own eyes

He was explicit: *"crucial that u can actually see stuff — if not u can't
design a 10/10 app"* (after catching a filter-overlap bug that text-only
checking missed). Render the app and look at it before claiming a UI change
works. Then **kill the QA server** — leaving it running is what caused the
2026-08-15 outage.

## How to report to him

- **Plain language, lead with what changed for the user.** Not "refactored the
  planner fixpoint" — "the plan now updates instantly when you tick a step".
- **Proof over promises.** Show the test output, name the files, paste the
  verified number. He has been given invented progress percentages before and
  he does not forget it.
- **Round progress down**, and only quote a percentage backed by a real audit.
- **Own mistakes plainly and move on.** No grovelling, no essays. State what
  broke, what you did, what's next.
- End every block with: **what landed, what's next, any blocker.**

## The feedback ledger

`AI_TODO.md` carries a **CEO FEEDBACK LEDGER**. Every piece of feedback he
gives goes in with a timestamp, and stays until it is genuinely done. He
checks that things he said days ago were not quietly dropped. Add to it before
you start working on the feedback, not after.

## Multi-worker coordination

More than one coder may work this repo. Before a big multi-file effort, write
a dated **area lock** into `AI_TODO.md` claiming the area, and release it when
done. Never edit a file with uncommitted changes you did not make. If another
session owns an area, stay out of it.
