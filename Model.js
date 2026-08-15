var MINUTE = 60

function clampInt(value, fallback, min, max) {
  var n = Number(value)
  if (!isFinite(n)) return fallback
  n = Math.round(n)
  if (n < min) return min
  if (n > max) return max
  return n
}

function boolOr(value, fallback) {
  if (value === undefined || value === null) return fallback
  return value === true || value === "true" || value === 1
}

function buildRules(settings) {
  var s = settings || {}
  return [
    {
      id: "pomodoro",
      type: "pomodoro",
      label: "Pomodoro",
      glyph: "\uf017",
      workSec: clampInt(s.pomodoroWorkMinutes, 25, 1, 180) * MINUTE,
      breakSec: clampInt(s.pomodoroBreakMinutes, 5, 1, 60) * MINUTE,
      longBreakSec: clampInt(s.pomodoroLongBreakMinutes, 15, 1, 120) * MINUTE,
      cycle: clampInt(s.pomodoroCycle, 4, 1, 12),
      autostart: boolOr(s.pomodoroAutostart, false),
      breakScreen: boolOr(s.pomodoroBreakScreen, false)
    },
    {
      id: "look-away",
      type: "interval",
      label: "Look away",
      glyph: "\uf06e",
      workSec: clampInt(s.lookAwayEveryMinutes, 20, 1, 180) * MINUTE,
      breakSec: clampInt(s.lookAwaySeconds, 20, 5, 600),
      longBreakSec: 0,
      cycle: 0,
      autostart: boolOr(s.lookAwayEnabled, true),
      breakScreen: boolOr(s.lookAwayBreakScreen, true)
    },
    {
      id: "stand-up",
      type: "interval",
      label: "Stand up",
      glyph: "\uf062",
      workSec: clampInt(s.standUpEveryMinutes, 50, 1, 240) * MINUTE,
      breakSec: clampInt(s.standUpMinutes, 5, 1, 60) * MINUTE,
      longBreakSec: 0,
      cycle: 0,
      autostart: boolOr(s.standUpEnabled, true),
      breakScreen: boolOr(s.standUpBreakScreen, false)
    }
  ]
}

function idleRuntime() {
  return { phase: "idle", running: false, endsAt: 0, remainingSec: 0, completed: 0 }
}

function isLongBreak(rule, completed) {
  return rule.type === "pomodoro" && completed > 0 && completed % rule.cycle === 0
}

function phaseSeconds(rule, phase, completed) {
  if (phase === "work") return rule.workSec
  return isLongBreak(rule, completed) ? rule.longBreakSec : rule.breakSec
}

function enterPhase(rule, phase, completed, nowMs) {
  var seconds = phaseSeconds(rule, phase, completed)
  return {
    phase: phase,
    running: true,
    endsAt: nowMs + seconds * 1000,
    remainingSec: seconds,
    completed: completed
  }
}

function start(rule, nowMs) {
  return enterPhase(rule, "work", 0, nowMs)
}

function skip(rule, runtime, nowMs) {
  var rt = runtime && runtime.phase !== "idle" ? runtime : start(rule, nowMs)
  var completed = rt.phase === "work" ? rt.completed + 1 : rt.completed
  var next = rt.phase === "work" ? "break" : "work"
  return enterPhase(rule, next, completed, nowMs)
}

function tick(rule, runtime, nowMs) {
  if (!runtime || !runtime.running) return { runtime: runtime, event: null }
  if (nowMs < runtime.endsAt) return { runtime: runtime, event: null }

  var wasWork = runtime.phase === "work"
  var completed = wasWork ? runtime.completed + 1 : runtime.completed
  var next = enterPhase(rule, wasWork ? "break" : "work", completed, nowMs)

  return {
    runtime: next,
    event: {
      ruleId: rule.id,
      label: rule.label,
      glyph: rule.glyph,
      phase: next.phase,
      seconds: next.remainingSec,
      completed: next.completed,
      longBreak: next.phase === "break" && isLongBreak(rule, next.completed),
      breakScreen: next.phase === "break" && rule.breakScreen === true
    }
  }
}

function pause(runtime, nowMs) {
  if (!runtime || !runtime.running) return runtime
  return {
    phase: runtime.phase,
    running: false,
    endsAt: 0,
    remainingSec: remainingSec(runtime, nowMs),
    completed: runtime.completed
  }
}

function resume(runtime, nowMs) {
  if (!runtime || runtime.running || runtime.phase === "idle") return runtime
  return {
    phase: runtime.phase,
    running: true,
    endsAt: nowMs + runtime.remainingSec * 1000,
    remainingSec: runtime.remainingSec,
    completed: runtime.completed
  }
}

function remainingSec(runtime, nowMs) {
  if (!runtime || runtime.phase === "idle") return 0
  if (!runtime.running) return runtime.remainingSec
  return Math.max(0, Math.ceil((runtime.endsAt - nowMs) / 1000))
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n)
}

function formatClock(seconds) {
  var total = Math.max(0, Math.round(seconds))
  var minutes = Math.floor(total / 60)
  var rest = total % 60
  if (minutes < 60) return minutes + ":" + pad2(rest)
  return Math.floor(minutes / 60) + ":" + pad2(minutes % 60) + ":" + pad2(rest)
}

function compactLabel(runtime, nowMs) {
  if (!runtime || runtime.phase === "idle") return ""
  var sec = remainingSec(runtime, nowMs)
  return sec >= 60 ? String(Math.ceil(sec / 60)) : String(sec)
}

function phaseText(rule, runtime) {
  if (!runtime || runtime.phase === "idle") return "Off"
  if (runtime.phase === "work") return rule.type === "pomodoro" ? "Focus" : "Next break in"
  if (isLongBreak(rule, runtime.completed)) return "Long break"
  return "Break"
}

function nextDue(rules, runtimes, nowMs) {
  var best = null
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i]
    var rt = runtimes ? runtimes[rule.id] : null
    if (!rt || !rt.running) continue
    var sec = remainingSec(rt, nowMs)
    if (best === null || sec < best.seconds) best = { rule: rule, runtime: rt, seconds: sec }
  }
  return best
}

function summary(rules, runtimes, nowMs) {
  var lines = []
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i]
    var rt = runtimes ? runtimes[rule.id] : null
    if (!rt || rt.phase === "idle") {
      lines.push(rule.label + ": off")
      continue
    }
    var state = rt.running ? formatClock(remainingSec(rt, nowMs)) : "paused " + formatClock(rt.remainingSec)
    lines.push(rule.label + ": " + phaseText(rule, rt).toLowerCase() + " " + state)
  }
  return lines.join("\n")
}

function notificationFor(event) {
  if (event.phase === "break") {
    var body = event.longBreak
      ? "Long break, " + formatClock(event.seconds)
      : "Take " + formatClock(event.seconds)
    if (event.ruleId === "look-away") body = "Look 20 feet away for " + event.seconds + " seconds"
    if (event.ruleId === "stand-up") body = "Stand up and move for " + formatClock(event.seconds)
    return { title: event.label, body: body, urgency: "normal" }
  }
  return { title: event.label, body: "Back to it, " + formatClock(event.seconds) + " to go", urgency: "low" }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MINUTE: MINUTE,
    clampInt: clampInt,
    boolOr: boolOr,
    buildRules: buildRules,
    idleRuntime: idleRuntime,
    isLongBreak: isLongBreak,
    phaseSeconds: phaseSeconds,
    enterPhase: enterPhase,
    start: start,
    skip: skip,
    tick: tick,
    pause: pause,
    resume: resume,
    remainingSec: remainingSec,
    formatClock: formatClock,
    compactLabel: compactLabel,
    phaseText: phaseText,
    nextDue: nextDue,
    summary: summary,
    notificationFor: notificationFor
  }
}
