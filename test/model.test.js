const assert = require("node:assert/strict")
const M = require("../Model.js")

const T0 = 1700000000000

function ruleById(id, settings) {
  return M.buildRules(settings || {}).find(r => r.id === id)
}

function run(name, fn) {
  fn()
  process.stdout.write("ok - " + name + "\n")
}

run("defaults match the documented rules", () => {
  const rules = M.buildRules({})
  assert.deepEqual(rules.map(r => r.id), ["pomodoro", "look-away", "stand-up"])
  assert.equal(ruleById("pomodoro").workSec, 25 * 60)
  assert.equal(ruleById("pomodoro").breakSec, 5 * 60)
  assert.equal(ruleById("pomodoro").longBreakSec, 15 * 60)
  assert.equal(ruleById("pomodoro").cycle, 4)
  assert.equal(ruleById("look-away").workSec, 20 * 60)
  assert.equal(ruleById("look-away").breakSec, 20)
  assert.equal(ruleById("stand-up").workSec, 50 * 60)
  assert.equal(ruleById("stand-up").breakSec, 5 * 60)
})

run("settings override and clamp out of range values", () => {
  assert.equal(ruleById("pomodoro", { pomodoroWorkMinutes: 45 }).workSec, 45 * 60)
  assert.equal(ruleById("pomodoro", { pomodoroWorkMinutes: 0 }).workSec, 60)
  assert.equal(ruleById("pomodoro", { pomodoroWorkMinutes: 9999 }).workSec, 180 * 60)
  assert.equal(ruleById("pomodoro", { pomodoroWorkMinutes: "nonsense" }).workSec, 25 * 60)
  assert.equal(ruleById("look-away", { lookAwaySeconds: 1 }).breakSec, 5)
  assert.equal(ruleById("look-away", { lookAwayEveryMinutes: 20.6 }).workSec, 21 * 60)
})

run("break rules default on, pomodoro defaults off", () => {
  assert.equal(ruleById("look-away").autostart, true)
  assert.equal(ruleById("stand-up").autostart, true)
  assert.equal(ruleById("pomodoro").autostart, false)
  assert.equal(ruleById("look-away", { lookAwayEnabled: false }).autostart, false)
  assert.equal(ruleById("pomodoro", { pomodoroAutostart: true }).autostart, true)
})

run("only the look-away rule shows a break screen by default", () => {
  assert.equal(ruleById("look-away").breakScreen, true)
  assert.equal(ruleById("stand-up").breakScreen, false)
  assert.equal(ruleById("pomodoro").breakScreen, false)
})

run("a fresh start begins a work phase", () => {
  const rule = ruleById("look-away")
  const rt = M.start(rule, T0)
  assert.equal(rt.phase, "work")
  assert.equal(rt.running, true)
  assert.equal(rt.completed, 0)
  assert.equal(rt.endsAt, T0 + 20 * 60 * 1000)
})

run("tick is a no-op before the phase ends", () => {
  const rule = ruleById("look-away")
  const rt = M.start(rule, T0)
  const out = M.tick(rule, rt, T0 + 19 * 60 * 1000)
  assert.equal(out.event, null)
  assert.equal(out.runtime, rt)
})

run("tick flips work to break and back", () => {
  const rule = ruleById("look-away")
  let rt = M.start(rule, T0)

  const toBreak = M.tick(rule, rt, rt.endsAt)
  assert.equal(toBreak.runtime.phase, "break")
  assert.equal(toBreak.runtime.remainingSec, 20)
  assert.equal(toBreak.runtime.completed, 1)
  assert.equal(toBreak.event.phase, "break")
  assert.equal(toBreak.event.breakScreen, true)

  const toWork = M.tick(rule, toBreak.runtime, toBreak.runtime.endsAt)
  assert.equal(toWork.runtime.phase, "work")
  assert.equal(toWork.runtime.remainingSec, 20 * 60)
  assert.equal(toWork.runtime.completed, 1)
  assert.equal(toWork.event.phase, "work")
  assert.equal(toWork.event.breakScreen, false)
})

run("pomodoro takes a long break every fourth work phase", () => {
  const rule = ruleById("pomodoro")
  let rt = M.start(rule, T0)
  let now = T0
  const breaks = []

  for (let i = 0; i < 8; i++) {
    now = rt.endsAt
    const out = M.tick(rule, rt, now)
    rt = out.runtime
    if (out.event.phase === "break") breaks.push({ long: out.event.longBreak, seconds: out.event.seconds })
  }

  assert.deepEqual(breaks.map(b => b.long), [false, false, false, true])
  assert.deepEqual(breaks.map(b => b.seconds), [300, 300, 300, 900])
})

run("a stalled shell advances one phase per tick, not many", () => {
  const rule = ruleById("look-away")
  const rt = M.start(rule, T0)
  const out = M.tick(rule, rt, T0 + 10 * 60 * 60 * 1000)
  assert.equal(out.runtime.phase, "break")
  assert.equal(out.runtime.completed, 1)
})

run("pause freezes the remaining time and resume restores it", () => {
  const rule = ruleById("look-away")
  const rt = M.start(rule, T0)
  const paused = M.pause(rt, T0 + 5 * 60 * 1000)
  assert.equal(paused.running, false)
  assert.equal(paused.remainingSec, 15 * 60)

  assert.equal(M.remainingSec(paused, T0 + 60 * 60 * 1000), 15 * 60)

  const resumed = M.resume(paused, T0 + 60 * 60 * 1000)
  assert.equal(resumed.running, true)
  assert.equal(resumed.endsAt, T0 + 60 * 60 * 1000 + 15 * 60 * 1000)
})

run("pause and resume are no-ops in the wrong state", () => {
  const idle = M.idleRuntime()
  assert.equal(M.pause(idle, T0), idle)
  assert.equal(M.resume(idle, T0), idle)
})

run("skip advances the phase without waiting", () => {
  const rule = ruleById("look-away")
  const rt = M.start(rule, T0)
  const skipped = M.skip(rule, rt, T0 + 1000)
  assert.equal(skipped.phase, "break")
  assert.equal(skipped.completed, 1)

  const back = M.skip(rule, skipped, T0 + 2000)
  assert.equal(back.phase, "work")
  assert.equal(back.completed, 1)
})

run("skip from idle starts the rule", () => {
  const rule = ruleById("look-away")
  const out = M.skip(rule, M.idleRuntime(), T0)
  assert.equal(out.phase, "break")
})

run("clock formatting covers seconds, minutes and hours", () => {
  assert.equal(M.formatClock(0), "0:00")
  assert.equal(M.formatClock(9), "0:09")
  assert.equal(M.formatClock(60), "1:00")
  assert.equal(M.formatClock(1500), "25:00")
  assert.equal(M.formatClock(3600), "1:00:00")
  assert.equal(M.formatClock(3661), "1:01:01")
  assert.equal(M.formatClock(-5), "0:00")
})

run("the bar label stays at most two characters", () => {
  const rule = ruleById("look-away")
  const rt = M.start(rule, T0)
  assert.equal(M.compactLabel(rt, T0), "20")
  assert.equal(M.compactLabel(rt, T0 + 19 * 60 * 1000 + 30 * 1000), "30")
  assert.equal(M.compactLabel(M.idleRuntime(), T0), "")
})

run("phase text distinguishes the rule types", () => {
  const pomodoro = ruleById("pomodoro")
  const lookAway = ruleById("look-away")
  assert.equal(M.phaseText(pomodoro, M.idleRuntime()), "Off")
  assert.equal(M.phaseText(pomodoro, M.start(pomodoro, T0)), "Focus")
  assert.equal(M.phaseText(lookAway, M.start(lookAway, T0)), "Next break in")
  assert.equal(M.phaseText(pomodoro, { phase: "break", completed: 4, running: true }), "Long break")
  assert.equal(M.phaseText(pomodoro, { phase: "break", completed: 1, running: true }), "Break")
})

run("nextDue picks the soonest running rule and ignores stopped ones", () => {
  const rules = M.buildRules({})
  const runtimes = {
    "pomodoro": M.idleRuntime(),
    "look-away": M.start(ruleById("look-away"), T0),
    "stand-up": M.start(ruleById("stand-up"), T0)
  }
  assert.equal(M.nextDue(rules, runtimes, T0).rule.id, "look-away")

  runtimes["look-away"] = M.pause(runtimes["look-away"], T0)
  assert.equal(M.nextDue(rules, runtimes, T0).rule.id, "stand-up")

  assert.equal(M.nextDue(rules, { }, T0), null)
})

run("summary reports every rule", () => {
  const rules = M.buildRules({})
  const runtimes = { "look-away": M.start(ruleById("look-away"), T0) }
  const lines = M.summary(rules, runtimes, T0).split("\n")
  assert.equal(lines.length, 3)
  assert.equal(lines[0], "Pomodoro: off")
  assert.equal(lines[1], "Look away: next break in 20:00")
})

run("notifications name the actual break", () => {
  const lookAway = M.notificationFor({ ruleId: "look-away", label: "Look away", phase: "break", seconds: 20 })
  assert.match(lookAway.body, /20 feet away for 20 seconds/)

  const standUp = M.notificationFor({ ruleId: "stand-up", label: "Stand up", phase: "break", seconds: 300 })
  assert.match(standUp.body, /Stand up and move for 5:00/)

  const long = M.notificationFor({ ruleId: "pomodoro", label: "Pomodoro", phase: "break", seconds: 900, longBreak: true })
  assert.match(long.body, /Long break, 15:00/)

  const back = M.notificationFor({ ruleId: "pomodoro", label: "Pomodoro", phase: "work", seconds: 1500 })
  assert.equal(back.urgency, "low")
  assert.match(back.body, /25:00 to go/)
})

function clockAt(text, weekday) {
  // text is "YYYY-MM-DD HH:MM"
  const [datePart, timePart] = text.split(" ")
  const [y, m, d] = datePart.split("-").map(Number)
  const [hh, mm] = timePart.split(":").map(Number)
  const date = new Date(y, m - 1, d, hh, mm, 0, 0)
  const clock = M.clockFrom(date)
  if (weekday !== undefined) clock.weekday = weekday
  return clock
}

run("pomodoro presets are whole minutes and cover the usual lengths", () => {
  assert.ok(M.POMODORO_PRESETS.includes(20))
  assert.ok(M.POMODORO_PRESETS.includes(35))
  assert.ok(M.POMODORO_PRESETS.includes(50))
  assert.ok(M.POMODORO_PRESETS.includes(55))
  for (const preset of M.POMODORO_PRESETS) {
    assert.equal(preset, Math.round(preset), "preset must be whole minutes: " + preset)
    assert.ok(preset >= 1 && preset <= 180)
  }
})

run("a custom timer can be written as a wall clock time", () => {
  const parsed = M.parseCustom("Stretch at 14:30")
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.entry, { kind: "at", label: "Stretch", atMinutes: 870, weekdaysOnly: false, enabled: true })

  const weekdays = M.parseCustom("Standup at 09:45 weekdays")
  assert.equal(weekdays.entry.weekdaysOnly, true)
  assert.equal(weekdays.entry.atMinutes, 585)

  const multiword = M.parseCustom("Take the bins out at 07:05")
  assert.equal(multiword.entry.label, "Take the bins out")
})

run("a custom timer can be written as an interval", () => {
  assert.deepEqual(M.parseCustom("Water every 45").entry,
    { kind: "every", label: "Water", everyMin: 45, enabled: true })
  assert.equal(M.parseCustom("Water every 45 min").entry.everyMin, 45)
  assert.equal(M.parseCustom("Water every 90 minutes").entry.everyMin, 90)
})

run("nonsense and out of range values are refused with a hint", () => {
  for (const bad of ["", "   ", "nonsense", "at 14:30", "every 45", "Stretch at 25:00", "Stretch at 10:70", "Water every 0", "Water every 5000"]) {
    const parsed = M.parseCustom(bad)
    assert.equal(parsed.ok, false, "should refuse: " + bad)
    assert.ok(parsed.error.length > 0)
  }
})

run("an interval timer counts down and reschedules itself", () => {
  const entry = M.parseCustom("Water every 45").entry
  const start = clockAt("2026-08-15 09:00")

  const first = M.customTick(entry, null, start)
  assert.equal(first.event, null)
  assert.equal(first.runtime.endsAt, start.ms + 45 * 60000)

  const before = M.customTick(entry, first.runtime, clockAt("2026-08-15 09:44"))
  assert.equal(before.event, null)

  const due = M.customTick(entry, first.runtime, clockAt("2026-08-15 09:45"))
  assert.notEqual(due.event, null)
  assert.equal(due.event.label, "Water")
  assert.equal(due.runtime.endsAt, clockAt("2026-08-15 09:45").ms + 45 * 60000)
})

run("a wall clock timer fires once and then not again that day", () => {
  const entry = M.parseCustom("Stretch at 14:30").entry
  let runtime = null

  assert.equal(M.customTick(entry, runtime, clockAt("2026-08-15 14:29")).event, null)

  const fired = M.customTick(entry, runtime, clockAt("2026-08-15 14:30"))
  assert.notEqual(fired.event, null)
  assert.equal(fired.event.label, "Stretch")
  runtime = fired.runtime

  assert.equal(M.customTick(entry, runtime, clockAt("2026-08-15 14:31")).event, null)
  assert.equal(M.customTick(entry, runtime, clockAt("2026-08-15 20:00")).event, null)
})

run("the same timer fires again the next day", () => {
  const entry = M.parseCustom("Stretch at 14:30").entry
  const runtime = M.customTick(entry, null, clockAt("2026-08-15 14:30")).runtime
  const nextDay = M.customTick(entry, runtime, clockAt("2026-08-16 14:30"))
  assert.notEqual(nextDay.event, null)
})

run("a reminder hours late is dropped rather than replayed on startup", () => {
  const entry = M.parseCustom("Stretch at 09:00").entry
  const late = M.customTick(entry, null, clockAt("2026-08-15 23:00"))
  assert.equal(late.event, null, "should not fire fourteen hours late")
  assert.equal(late.runtime.lastDay, "2026-08-15", "and should not fire later either")

  const slightlyLate = M.customTick(entry, null, clockAt("2026-08-15 09:07"))
  assert.notEqual(slightlyLate.event, null, "seven minutes late is still a reminder")
})

run("weekday only timers stay quiet at the weekend", () => {
  const entry = M.parseCustom("Standup at 09:45 weekdays").entry
  const sunday = clockAt("2026-08-16 09:45", 0)
  const monday = clockAt("2026-08-17 09:45", 1)

  assert.equal(M.runsToday(entry, sunday), false)
  assert.equal(M.customTick(entry, null, sunday).event, null)
  assert.equal(M.runsToday(entry, monday), true)
  assert.notEqual(M.customTick(entry, null, monday).event, null)
})

run("a disabled timer never fires", () => {
  const entry = Object.assign(M.parseCustom("Water every 1").entry, { enabled: false })
  assert.equal(M.customTick(entry, { endsAt: 0 }, clockAt("2026-08-15 09:00")).event, null)
})

run("schedules describe themselves in words", () => {
  assert.equal(M.describeCustom(M.parseCustom("Stretch at 14:30").entry), "at 14:30 daily")
  assert.equal(M.describeCustom(M.parseCustom("Standup at 09:05 weekdays").entry), "at 09:05 on weekdays")
  assert.equal(M.describeCustom(M.parseCustom("Water every 45").entry), "every 45 min")
  assert.equal(M.describeCustom(null), "")
})

run("the next due readout is human sized", () => {
  const at = M.parseCustom("Stretch at 14:30").entry
  assert.equal(M.nextDueText(at, null, clockAt("2026-08-15 14:00")), "in 30 min")
  assert.equal(M.nextDueText(at, null, clockAt("2026-08-15 09:00")), "in 5h 30m")
  assert.equal(M.nextDueText(at, { lastDay: "2026-08-15" }, clockAt("2026-08-15 15:00")), "done today")
  assert.equal(M.nextDueText(Object.assign({}, at, { enabled: false }), null, clockAt("2026-08-15 09:00")), "off")

  const every = M.parseCustom("Water every 45").entry
  const clock = clockAt("2026-08-15 09:00")
  assert.equal(M.nextDueText(every, null, clock), "starting")
  assert.match(M.nextDueText(every, { endsAt: clock.ms + 60000 }, clock), /^in 1:00$/)
})

run("state survives a round trip and rubbish is discarded", () => {
  const customs = [M.parseCustom("Stretch at 14:30").entry, M.parseCustom("Water every 45").entry]
  const state = M.serializeState(customs, { "0": { lastDay: "2026-08-15" } }, { pomodoro: { phase: "work" } })
  const back = M.parseState(JSON.stringify(state))
  assert.equal(back.customs.length, 2)
  assert.equal(back.customs[0].label, "Stretch")
  assert.equal(back.customRuntimes["0"].lastDay, "2026-08-15")

  const broken = M.parseState("not json at all")
  assert.deepEqual(broken.customs, [])

  const partial = M.parseState(JSON.stringify({ customs: [{ kind: "nope" }, { label: "no kind" }, null, 7] }))
  assert.deepEqual(partial.customs, [])
})

run("a stored rule runtime is restored only while it still points at the future", () => {
  const rule = M.buildRules({}).find(r => r.id === "look-away")
  const now = 1700000000000

  const live = M.restoreRuleRuntime(rule, { phase: "work", running: true, endsAt: now + 60000, completed: 2 }, now)
  assert.equal(live.running, true)
  assert.equal(live.remainingSec, 60)
  assert.equal(live.completed, 2)

  assert.equal(M.restoreRuleRuntime(rule, { phase: "work", running: true, endsAt: now - 1, completed: 2 }, now), null)
  assert.equal(M.restoreRuleRuntime(rule, { phase: "idle" }, now), null)
  assert.equal(M.restoreRuleRuntime(rule, null, now), null)

  const paused = M.restoreRuleRuntime(rule, { phase: "break", running: false, remainingSec: 12, completed: 1 }, now)
  assert.equal(paused.running, false)
  assert.equal(paused.remainingSec, 12)
})


process.stdout.write("\nall Model.js tests passed\n")
