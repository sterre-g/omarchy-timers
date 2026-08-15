# Work done

## 2026-08-15 - first release

- `main`: pomodoro, 20-20-20 eye rest and stand-up as three rules over one
  engine. Pure state machine in `Model.js` with 19 node assertions, a singleton
  `Service.qml` that owns the clock, a per monitor bar widget and panel in
  `Panel.qml`, and a fullscreen break screen in `Overlay.qml`. Notifications go
  through `omarchy-notification-send`.
- Timing lives in the service rather than the widget because a bar widget is
  built once per monitor, and this machine has two: the first cut fired every
  notification twice.
- The panel opens on the focused monitor. The bar keeps one panel open shell
  wide, so opening on every monitor left it open on whichever answered last.

## 2026-08-15 - presets and custom timers

- `feat/presets-and-custom-timers`: whole minute focus presets written back to
  the widget's shell.json entry, and user defined timers in two shapes, a wall
  clock time (optionally weekdays only) or a repeating interval.
- Custom timers and the rule countdowns persist to
  `~/.local/state/omarchy/sterre-timers.json`, so a restart no longer loses
  them. A wall clock reminder tracks whether it fired today, and one more than
  ten minutes late is dropped rather than replayed on startup.
- Parsing is one line of text rather than a four field form, which keeps the
  whole thing in `Model.js` and under test: 33 assertions now.
