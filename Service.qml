import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null

  property var settings: ({})
  property string settingsKey: ""
  property var rules: Model.buildRules(root.settings)
  property var runtimes: ({})
  property double nowMs: Date.now()

  readonly property var due: Model.nextDue(root.rules, root.runtimes, root.nowMs)
  readonly property string barText: root.due ? Model.compactLabel(root.due.runtime, root.nowMs) : ""
  readonly property string summaryText: Model.summary(root.rules, root.runtimes, root.nowMs)
  readonly property bool onBreak: {
    for (var i = 0; i < root.rules.length; i++) {
      var rt = root.runtimes[root.rules[i].id]
      if (rt && rt.running && rt.phase === "break") return true
    }
    return false
  }

  function resolvedOmarchyPath() {
    return root.omarchyPath !== "" ? root.omarchyPath : (Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy")
  }

  // Every per-monitor bar widget pushes the same inline settings. Rebuild only
  // when they actually change, otherwise each push would restart the rules.
  function applySettings(next) {
    var key = JSON.stringify(next || {})
    if (key === root.settingsKey) return
    root.settingsKey = key
    root.settings = next || {}
  }

  // Per-monitor bar widgets register here so the single IPC target can still
  // drive their panels, which is what the base Panel would have done if this
  // plugin did not need a singleton to own the clock.
  property var widgets: []

  function registerWidget(widget) {
    if (!widget || root.widgets.indexOf(widget) !== -1) return
    var next = root.widgets.slice()
    next.push(widget)
    root.widgets = next
  }

  function unregisterWidget(widget) {
    var index = root.widgets.indexOf(widget)
    if (index === -1) return
    var next = root.widgets.slice()
    next.splice(index, 1)
    root.widgets = next
  }

  function eachWidget(method) {
    for (var i = 0; i < root.widgets.length; i++) {
      var widget = root.widgets[i]
      if (widget && typeof widget[method] === "function") widget[method]()
    }
  }

  function focusedWidget() {
    for (var i = 0; i < root.widgets.length; i++) {
      if (root.widgets[i] && root.widgets[i].onFocusedScreen === true) return root.widgets[i]
    }
    return root.widgets.length > 0 ? root.widgets[0] : null
  }

  function callFocused(method) {
    var widget = root.focusedWidget()
    if (widget && typeof widget[method] === "function") widget[method]()
  }

  function runtimeFor(id) {
    var rt = root.runtimes[id]
    return rt ? rt : Model.idleRuntime()
  }

  function ruleById(id) {
    for (var i = 0; i < root.rules.length; i++) {
      if (root.rules[i].id === id) return root.rules[i]
    }
    return null
  }

  function setRuntime(id, runtime) {
    var next = {}
    for (var key in root.runtimes) next[key] = root.runtimes[key]
    next[id] = runtime
    root.runtimes = next
  }

  function syncRuntimes() {
    var now = Date.now()
    var next = {}
    for (var i = 0; i < root.rules.length; i++) {
      var rule = root.rules[i]
      var prev = root.runtimes[rule.id]
      if (prev && prev.phase !== "idle") next[rule.id] = prev
      else next[rule.id] = rule.autostart ? Model.start(rule, now) : Model.idleRuntime()
    }
    root.runtimes = next
    root.nowMs = now
  }

  function toggleRule(id) {
    var rule = root.ruleById(id)
    if (!rule) return
    var rt = root.runtimeFor(id)
    var now = Date.now()
    if (rt.phase === "idle") root.setRuntime(id, Model.start(rule, now))
    else if (rt.running) root.setRuntime(id, Model.pause(rt, now))
    else root.setRuntime(id, Model.resume(rt, now))
  }

  function skipRule(id) {
    var rule = root.ruleById(id)
    if (!rule) return
    root.setRuntime(id, Model.skip(rule, root.runtimeFor(id), Date.now()))
  }

  function resetRule(id) {
    var rule = root.ruleById(id)
    if (!rule) return
    root.setRuntime(id, Model.start(rule, Date.now()))
  }

  function stopRule(id) {
    if (!root.ruleById(id)) return
    root.setRuntime(id, Model.idleRuntime())
  }

  function announce(event) {
    var note = Model.notificationFor(event)
    var base = root.resolvedOmarchyPath()

    Quickshell.execDetached([base + "/bin/omarchy-notification-send",
                             "-g", event.glyph,
                             "-u", note.urgency,
                             note.title, note.body])

    if (Model.boolOr(root.settings.sound, true)) {
      Quickshell.execDetached(["pw-play", event.phase === "break"
        ? "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga"
        : "/usr/share/sounds/freedesktop/stereo/complete.oga"])
    }

    if (event.breakScreen) {
      Quickshell.execDetached([base + "/bin/omarchy-shell", "shell", "summon", root.pluginId(),
                               JSON.stringify({ ruleId: event.ruleId,
                                                label: event.label,
                                                glyph: event.glyph,
                                                seconds: event.seconds })])
    }
  }

  function pluginId() {
    return (root.manifest && root.manifest.id) || "sterre.timers"
  }

  function tickAll() {
    var now = Date.now()
    root.nowMs = now

    var next = null
    for (var i = 0; i < root.rules.length; i++) {
      var rule = root.rules[i]
      var out = Model.tick(rule, root.runtimes[rule.id], now)
      if (!out.event) continue
      if (next === null) {
        next = {}
        for (var key in root.runtimes) next[key] = root.runtimes[key]
      }
      next[rule.id] = out.runtime
      root.announce(out.event)
    }
    if (next !== null) root.runtimes = next
  }

  onRulesChanged: root.syncRuntimes()
  Component.onCompleted: root.syncRuntimes()

  Timer {
    interval: 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.tickAll()
  }

  IpcHandler {
    target: "sterre.timers"

    function probe(): string {
      var states = []
      for (var i = 0; i < root.widgets.length; i++) {
        var w = root.widgets[i]
        states.push({ opened: w ? w.opened === true : null, hasOpen: w ? typeof w.open === "function" : false })
      }
      return JSON.stringify({ widgets: root.widgets.length, rules: root.rules.length, states: states })
    }
    function open(): void { root.callFocused("open") }
    function close(): void { root.eachWidget("close") }
    function toggle(): void { root.callFocused("toggle") }
    function status(): string { return Model.summary(root.rules, root.runtimes, Date.now()) }
    function start(id: string): string {
      if (!root.ruleById(id)) return "unknown rule: " + id
      root.resetRule(id)
      return "started " + id
    }
    function stop(id: string): string {
      if (!root.ruleById(id)) return "unknown rule: " + id
      root.stopRule(id)
      return "stopped " + id
    }
    function skip(id: string): string {
      if (!root.ruleById(id)) return "unknown rule: " + id
      root.skipRule(id)
      return "skipped " + id
    }
    function pause(id: string): string {
      if (!root.ruleById(id)) return "unknown rule: " + id
      var rt = root.runtimeFor(id)
      if (rt.running) root.toggleRule(id)
      return "paused " + id
    }
    function resume(id: string): string {
      if (!root.ruleById(id)) return "unknown rule: " + id
      var rt = root.runtimeFor(id)
      if (!rt.running && rt.phase !== "idle") root.toggleRule(id)
      return "resumed " + id
    }
  }
}
