# Bug report (`@runmu.sh/ext-bugreport`, id `bugreport`)

A panel for writing and filing bug reports on Torchship, plus a `[ ⚠ BUG ]` button that opens it. The draft lives on the game (the same one `@bug` edits in text), so you can start a report in the panel and finish it on the command line, or the other way round. When the game hits an error while running your command, the panel already has it: what you typed, where you were, and the traceback, ready to attach.

## The panel
```
 DRAFT                              [UNSAVED CHANGES]
 ┤DRAFT├───────────────────────────────────────────
 started in Freight Spur - Spare Parts
 SUBJECT   Kicking the glitch box throws an error
 SEVERITY  □LOW ■NORMAL □HIGH □CRITICAL
 CATEGORY  ■GENERAL □COMMANDS □COMBAT □SHIPS …
 WHAT HAPPENED                             101/8000
 ┌─────────────────────────────────────────────────┐
 │ I typed kick glitch box in the parts clinic.    │
 └─────────────────────────────────────────────────┘
 LAST ERROR
 E_RANGE Index 5 out of bounds for TYPE_LIST of length 2
 > kick glitch box · Freight Spur - Spare Parts · 2m ago
 ■ATTACH [ TRACEBACK ]
 ┤MY REPORTS (2)├──────────────────────────────────
 ▸ bugs/45  [HIGH] Kicking the glitch box …  RESOLVED
 [ SUBMIT ] [ SAVE DRAFT ] [ DISCARD ]
 Draft saved.
```

- **Opening it.** `[ ⚠ BUG ]` sits at the top right of the screen while the panel is closed. **Report a bug** is in ☰ and in the command palette (`bugreport.open`). Each of these opens the panel and starts a draft if you have none.
- **Editing.** Severity and category save when you click them. The subject and body save on `[ SAVE DRAFT ]`, on `[ SUBMIT ]`, and when the field loses focus. Until then the bar reads UNSAVED CHANGES. The body counts toward the game's 8000-character limit.
- **Last error.** It shows the error the game last recorded for your character: the code, the message, the command, the room and how long ago. `[ TRACEBACK ]` expands the trace. `■ ATTACH` decides whether the report carries it (on by default).
- **Filing.** `[ SUBMIT ]` puts the report in the bug queue and is disabled until there is a body. The status line gives the game's answer (`Thanks. Bug report bugs/46 is filed.`). `[ DISCARD ]` asks first.
- **My reports.** These are your last ten bug reports with their status. A click runs `@request bugs/N`, which prints the whole ticket.
- **Errors as they happen.** When a command of yours errors, a toast says *The game hit an error* and offers `[ REPORT IT ]`, which opens the panel.

## The server contract
| Direction | Message | Payload |
|---|---|---|
| in | `Bug.Draft` | `{ open, severities: [str], categories: [str], draft?: { subject, body, severity, category, traceback, started, location }, last_traceback?: tb }`. It is sent on login, on `Core.Supports`, and after every change, including changes made with `@bug` |
| in | `Bug.Traceback` | `tb` = `{ time, code, msg, where, command, location, traceback: [str] }`, the error the game just showed you |
| in | `Bug.Result` | `{ action, ok, message, id? }`: the outcome of the last Open/Save/Submit/Abort. `id` is the filed report's number |
| in | `Bug.Mine` | `{ reports: [{ id, ref, subject, status, created, updated }] }`, newest first, at most 10 |
| out | `Bug.Get` | `{}`: asks for the draft and the reports |
| out | `Bug.Mine` | `{}`: asks for the reports |
| out | `Bug.Open` | `{}`: starts a draft (keeps the one you have) |
| out | `Bug.Save` | any of `{ subject, body, severity, category, traceback }`. An empty subject or body clears it |
| out | `Bug.Submit` | the same fields, saved first, then the draft is filed |
| out | `Bug.Abort` | `{}`: discards the draft |

The manifest declares `Bug 1`, so the client lists it in `Core.Supports` while the extension is enabled, and the host checks inbound messages against `schema/`. The extension activates on the first `Bug.*` message, so it stays idle on games that don't speak it.

## Settings
| Key | Scope | Default | What |
|---|---|---|---|
| `button.show` | world or device | on | Show the `[ ⚠ BUG ]` button |
| `offer.errors` | world or device | on | Offer to report an error when the game hits one |

## For other extensions
`await ctx.api('bugreport')` gives `{ open(sid?), state(sid?) }`. `open` opens the panel and starts a draft. `state` returns a copy of the last `Bug.Draft` for a session, or `null`.

## Developing
```
npm install
npm run dev        # serves src/ on :5199 for ?ext-dev=http://localhost:5199/
npm run build      # dist/index.js + manifest check
npm test           # the headless host: draft, edits, submit, button, toast, reports, style
```

Made with `npm create @runmu.sh/extension`.
