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
