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


// Whole minutes only, which is what a pomodoro length is ever expressed in.
var POMODORO_PRESETS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90]

var WEEKDAYS = [1, 2, 3, 4, 5]

// A custom timer is written as one line, because a form with four fields for
// "remind me at half two" is more UI than the idea deserves:
//   Stretch at 14:30
//   Standup at 09:45 weekdays
//   Water every 45
function parseCustom(text) {
  var raw = String(text || "").trim().replace(/\s+/g, " ")
  if (raw === "") return { ok: false, error: "Type something like: Stretch at 14:30" }

  var atMatch = /^(.*?)\s+at\s+(\d{1,2}):(\d{2})(\s+weekdays)?$/i.exec(raw)
  if (atMatch) {
    var label = atMatch[1].trim()
    var hours = Number(atMatch[2])
    var minutes = Number(atMatch[3])
    if (label === "") return { ok: false, error: "Give it a name, like: Stretch at 14:30" }
    if (hours > 23) return { ok: false, error: "Hour has to be 0 to 23" }
    if (minutes > 59) return { ok: false, error: "Minute has to be 0 to 59" }
    return {
      ok: true,
      entry: {
        kind: "at",
        label: label,
        atMinutes: hours * 60 + minutes,
        weekdaysOnly: !!atMatch[4],
        enabled: true
      }
    }
  }

  var everyMatch = /^(.*?)\s+every\s+(\d{1,4})(\s*m|\s*min|\s*mins|\s*minutes)?$/i.exec(raw)
  if (everyMatch) {
    var everyLabel = everyMatch[1].trim()
    var everyMin = Number(everyMatch[2])
    if (everyLabel === "") return { ok: false, error: "Give it a name, like: Water every 45" }
    if (everyMin < 1) return { ok: false, error: "Interval has to be at least a minute" }
    if (everyMin > 1440) return { ok: false, error: "Interval has to be a day or less" }
    return {
      ok: true,
      entry: { kind: "every", label: everyLabel, everyMin: everyMin, enabled: true }
    }
  }

  return { ok: false, error: "Try: Stretch at 14:30, or Water every 45" }
}

function pad2Local(n) {
  return n < 10 ? "0" + n : String(n)
}

// Everything the schedule needs to know about now, so the rest stays pure.
function clockFrom(date) {
  return {
    ms: date.getTime(),
    minutes: date.getHours() * 60 + date.getMinutes(),
    weekday: date.getDay(),
    dayKey: date.getFullYear() + "-" + pad2Local(date.getMonth() + 1) + "-" + pad2Local(date.getDate())
  }
}

function describeCustom(entry) {
  if (!entry) return ""
  if (entry.kind === "at") {
    var hours = Math.floor(entry.atMinutes / 60)
    var minutes = entry.atMinutes % 60
    return "at " + pad2Local(hours) + ":" + pad2Local(minutes) + (entry.weekdaysOnly ? " on weekdays" : " daily")
  }
  return "every " + entry.everyMin + " min"
}

function runsToday(entry, clock) {
  if (!entry.weekdaysOnly) return true
  return WEEKDAYS.indexOf(clock.weekday) !== -1
}

// A wall clock reminder that is hours late is not a reminder any more, so a
// shell started in the evening does not replay the whole day.
var LATE_GRACE_MINUTES = 10

function customTick(entry, runtime, clock) {
  var state = runtime || {}
  if (!entry || entry.enabled === false) return { runtime: state, event: null }

  if (entry.kind === "every") {
    if (!state.endsAt || state.endsAt > clock.ms + entry.everyMin * 60000) {
      return { runtime: { endsAt: clock.ms + entry.everyMin * 60000 }, event: null }
    }
    if (clock.ms < state.endsAt) return { runtime: state, event: null }
    return {
      runtime: { endsAt: clock.ms + entry.everyMin * 60000 },
      event: { label: entry.label, body: "Every " + entry.everyMin + " minutes" }
    }
  }

  if (!runsToday(entry, clock)) return { runtime: state, event: null }
  if (state.lastDay === clock.dayKey) return { runtime: state, event: null }
  if (clock.minutes < entry.atMinutes) return { runtime: state, event: null }

  var late = clock.minutes - entry.atMinutes
  if (late > LATE_GRACE_MINUTES) {
    return { runtime: { lastDay: clock.dayKey }, event: null }
  }

  return {
    runtime: { lastDay: clock.dayKey },
    event: { label: entry.label, body: describeCustom(entry) }
  }
}

function nextDueText(entry, runtime, clock) {
  if (!entry || entry.enabled === false) return "off"
  if (entry.kind === "every") {
    if (!runtime || !runtime.endsAt) return "starting"
    return "in " + formatClock(Math.max(0, Math.ceil((runtime.endsAt - clock.ms) / 1000)))
  }
  if (!runsToday(entry, clock)) return "not today"
  if (runtime && runtime.lastDay === clock.dayKey) return "done today"
  var minutesAway = entry.atMinutes - clock.minutes
  if (minutesAway <= 0) return "due"
  if (minutesAway < 60) return "in " + minutesAway + " min"
  return "in " + Math.floor(minutesAway / 60) + "h " + (minutesAway % 60) + "m"
}

function serializeState(customs, customRuntimes, ruleRuntimes) {
  return {
    version: 1,
    customs: customs || [],
    customRuntimes: customRuntimes || {},
    ruleRuntimes: ruleRuntimes || {}
  }
}

function parseState(raw) {
  var data = null
  try {
    data = JSON.parse(String(raw || ""))
  } catch (e) {
    return serializeState([], {}, {})
  }
  if (!data || typeof data !== "object") return serializeState([], {}, {})

  var customs = []
  var list = Array.isArray(data.customs) ? data.customs : []
  for (var i = 0; i < list.length; i++) {
    var entry = list[i]
    if (!entry || typeof entry !== "object") continue
    if (entry.kind !== "at" && entry.kind !== "every") continue
    if (!entry.label) continue
    customs.push({
      kind: entry.kind,
      label: String(entry.label),
      atMinutes: clampInt(entry.atMinutes, 0, 0, 1439),
      everyMin: clampInt(entry.everyMin, 30, 1, 1440),
      weekdaysOnly: entry.weekdaysOnly === true,
      enabled: entry.enabled !== false
    })
  }

  return serializeState(customs,
    data.customRuntimes && typeof data.customRuntimes === "object" ? data.customRuntimes : {},
    data.ruleRuntimes && typeof data.ruleRuntimes === "object" ? data.ruleRuntimes : {})
}

// A runtime restored from disk is only useful if it still points at the
// future; anything older belongs to a session that has already ended.
function restoreRuleRuntime(rule, stored, nowMs) {
  if (!stored || typeof stored !== "object") return null
  if (stored.phase !== "work" && stored.phase !== "break") return null
  if (!stored.running) {
    return {
      phase: stored.phase,
      running: false,
      endsAt: 0,
      remainingSec: clampInt(stored.remainingSec, 0, 0, 86400),
      completed: clampInt(stored.completed, 0, 0, 10000)
    }
  }
  if (!(Number(stored.endsAt) > nowMs)) return null
  return {
    phase: stored.phase,
    running: true,
    endsAt: Number(stored.endsAt),
    remainingSec: Math.ceil((Number(stored.endsAt) - nowMs) / 1000),
    completed: clampInt(stored.completed, 0, 0, 10000)
  }
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
    notificationFor: notificationFor,
    POMODORO_PRESETS: POMODORO_PRESETS,
    parseCustom: parseCustom,
    clockFrom: clockFrom,
    describeCustom: describeCustom,
    runsToday: runsToday,
    customTick: customTick,
    nextDueText: nextDueText,
    serializeState: serializeState,
    parseState: parseState,
    restoreRuleRuntime: restoreRuleRuntime
  }
}
