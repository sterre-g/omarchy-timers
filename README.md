# omarchy-timers

Pomodoro, 20-20-20 eye rest and stand-up reminders in one Omarchy bar widget.

All three are the same thing underneath: a rule that alternates a work phase
with a break phase. One engine runs them, so there is one place to fix a bug
and one widget in the bar instead of three.

| Rule | Default | Break | Break screen |
|---|---|---|---|
| Pomodoro | 25 min focus | 5 min, 15 min every 4th | off |
| Look away | every 20 min | 20 s | on |
| Stand up | every 50 min | 5 min | off |

Pomodoro is off until you start it. The two health rules start with the shell.

## Install

```sh
omarchy plugin add https://github.com/sterre-g/omarchy-timers.git --enable
```

Or clone it yourself into `~/.config/omarchy/plugins/sterre.timers/` and run
`omarchy-shell shell rescanPlugins`.

Place it in the bar:

```sh
omarchy plugin enable sterre.timers --section right --after omarchy.clock
```

## Using it

The bar button shows the time left on whichever rule is due next: minutes when
more than a minute remains, seconds below that. It turns the urgent colour
while a break is running, and its tooltip lists all three rules.

- Left click opens the panel, right click pauses or resumes the due rule.
- In the panel: `space` start or pause, `s` skip the current phase, `r` restart
  the rule, `o` turn it off, `Esc` close.
- The break screen takes over the display and dismisses on any key or click,
  or when the break runs out.

From a script or a keybinding:

```sh
omarchy-shell sterre.timers status              # all three rules, one line each
omarchy-shell sterre.timers start look-away     # also restarts a running rule
omarchy-shell sterre.timers skip pomodoro
omarchy-shell sterre.timers pause stand-up
omarchy-shell sterre.timers resume stand-up
omarchy-shell sterre.timers stop stand-up
omarchy-shell sterre.timers open                # panel, on the focused monitor
omarchy-shell sterre.timers toggle
```

## Settings

Every key in [manifest.json](manifest.json) under `barWidget.schema` is editable
from the bar widget settings UI, or inline on the widget entry in
`~/.config/omarchy/shell.json`:

```json
{ "id": "sterre.timers", "lookAwayEveryMinutes": 30, "standUpEnabled": false }
```

Changing a duration applies from the next phase, not the running one.

## How it works

[Model.js](Model.js) is the whole engine and is pure: `tick(rule, runtime, now)`
returns the next runtime plus an event, and never touches the clock or the
shell itself. That is what [test/model.test.js](test/model.test.js) exercises.

[Service.qml](Service.qml) is a singleton. It owns the one second `Timer`, feeds
`Model.tick`, and turns events into a notification through
`omarchy-notification-send`, an optional `pw-play` chime, and a summon of
[Overlay.qml](Overlay.qml) for rules with the break screen turned on. It exists
because a bar widget is built once per monitor: a timer living in the widget
would fire once per screen and notify you twice.

[Panel.qml](Panel.qml) is the bar widget, one instance per monitor, and only a
view. Each instance registers itself with the service so the single IPC target
can still open the panel, which it does on the focused monitor because the bar
keeps at most one panel open shell wide.

Two things worth knowing:

- Timer state lives in the shell process. `omarchy restart shell` restarts every
  running rule from the beginning.
- A tick advances one phase at a time. If the shell is suspended over several
  break intervals you get one notification on wake, not a queue of them.

There is no idle detection yet, so a rule that comes due while you are away from
the keyboard still fires.

## Development

```sh
./run-tests                                  # node, no framework
./dev-sync                                   # copy into ~/.config/omarchy/plugins/
omarchy plugin validate ~/.config/omarchy/plugins/sterre.timers
omarchy-shell shell rescanPlugins
omarchy-shell sterre.timers probe            # widget count the service can see
```

Saving a file under `~/.config/omarchy/plugins/` hot reloads it, but editing
[Service.qml](Service.qml) needs `omarchy restart shell`: the replaced instance
keeps its IPC target registered, so the new one is ignored until the process
restarts. Adding a brand new file to an installed plugin needs a restart too,
otherwise Qt serves its cached directory listing and reports a file name case
mismatch.

## License

MIT, see [LICENSE](LICENSE).
