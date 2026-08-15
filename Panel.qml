import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "sterre.timers"
  manageIpc: false

  property int cursorIndex: 0
  property bool cursorActive: false

  // One singleton service owns the clock for every monitor. Two bars means two
  // copies of this widget, and a timer that ran here would fire twice.
  // Resolved by assignment rather than a binding: ensureService() writes the
  // same shell state the lookup reads, which a binding turns into a loop.
  property var service: null
  readonly property var rules: root.service ? root.service.rules : []
  readonly property var runtimes: root.service ? root.service.runtimes : ({})
  readonly property double nowMs: root.service ? root.service.nowMs : 0
  readonly property string barText: root.service ? root.service.barText : ""
  readonly property bool onBreak: root.service ? root.service.onBreak : false

  // The bar keeps at most one panel open shell wide, so an IPC open aimed at
  // every monitor would leave the panel on whichever one answered last.
  readonly property string screenName: root.QsWindow.window && root.QsWindow.window.screen
    ? root.QsWindow.window.screen.name
    : ""
  readonly property bool onFocusedScreen: Hyprland.focusedMonitor && root.screenName !== ""
    ? Hyprland.focusedMonitor.name === root.screenName
    : false

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function resolveService() {
    if (root.service || !root.bar || !root.bar.shell) return
    var shell = root.bar.shell
    var found = typeof shell.serviceFor === "function" ? shell.serviceFor(root.moduleName) : null
    if (!found && typeof shell.ensureService === "function") found = shell.ensureService(root.moduleName)
    if (!found) return
    root.service = found
    root.attachService()
  }

  function attachService() {
    if (!root.service) return
    root.service.applySettings(root.settings)
    root.service.registerWidget(root)
  }

  function ruleAt(index) {
    if (index < 0 || index >= root.rules.length) return null
    return root.rules[index]
  }

  function moveCursor(dx, dy) {
    root.cursorActive = true
    if (dy === 0) return
    root.cursorIndex = Math.max(0, Math.min(root.rules.length - 1, root.cursorIndex + dy))
  }

  onBarChanged: root.resolveService()
  onSettingsChanged: root.attachService()
  Component.onCompleted: root.resolveService()
  Component.onDestruction: if (root.service) root.service.unregisterWidget(root)

  // The service is created lazily by the shell, so a widget built first has to
  // look again rather than give up.
  Timer {
    interval: 250
    repeat: true
    running: root.service === null
    triggeredOnStart: true
    onTriggered: root.resolveService()
  }
  onOpenedChanged: if (opened) {
    root.cursorActive = false
    Qt.callLater(function () { keyCatcher.forceActiveFocus() })
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.barText !== "" ? root.barText : "\uf017"
    fontSize: root.barText !== "" ? Math.round(Style.bar.iconFont * 0.92) : Style.bar.iconFont
    active: root.onBreak
    tooltipText: root.service ? root.service.summaryText : "Timers"
    onPressed: function (buttonCode) {
      if (buttonCode === Qt.RightButton && root.service && root.service.due)
        root.service.toggleRule(root.service.due.rule.id)
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(520))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function (dx, dy) {
        if (!root.cursorActive) {
          root.cursorActive = true
          return
        }
        root.moveCursor(dx, dy)
      }
      onActivateRequested: {
        var rule = root.ruleAt(root.cursorIndex)
        if (root.cursorActive && rule && root.service) root.service.toggleRule(rule.id)
      }
      onCloseRequested: root.close()
      onTabRequested: function (direction) { root.switchPanel(direction) }
      onTextKey: function (t) {
        var rule = root.ruleAt(root.cursorIndex)
        if (!rule || !root.service) return
        if (t === "s" || t === "S") root.service.skipRule(rule.id)
        else if (t === "r" || t === "R") root.service.resetRule(rule.id)
        else if (t === "o" || t === "O") root.service.stopRule(rule.id)
      }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(8)

        PanelSectionHeader {
          width: parent.width
          text: "Timers"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Repeater {
          model: root.rules

          Rectangle {
            id: row

            required property var modelData
            required property int index

            readonly property var runtime: root.runtimes[row.modelData.id]
            readonly property bool hasCursor: root.cursorActive && root.cursorIndex === row.index
            readonly property bool active: row.runtime && row.runtime.phase !== "idle"
            readonly property bool running: row.active && row.runtime.running
            readonly property bool breaking: row.runtime && row.runtime.phase === "break"

            width: parent.width
            implicitHeight: rowContent.implicitHeight + Style.spacing.controlPaddingY * 2
            radius: Style.cornerRadius
            color: row.hasCursor ? Style.hoverFill : "transparent"

            MouseArea {
              anchors.fill: parent
              acceptedButtons: Qt.LeftButton
              onClicked: {
                root.cursorActive = true
                root.cursorIndex = row.index
              }
            }

            Item {
              id: rowContent
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.spacing.controlPaddingX
              anchors.rightMargin: Style.spacing.sm
              implicitHeight: Math.max(labelColumn.implicitHeight, actions.implicitHeight)

              Text {
                id: glyphText
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: row.modelData.glyph
                font.family: root.fontFamily
                font.pixelSize: Style.font.iconLarge
                color: row.breaking ? Color.accent : (row.active ? root.foreground : root.dim)
              }

              Row {
                id: actions
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.spacing.xs

                PanelActionButton {
                  iconText: row.running ? "\uf04c" : "\uf04b"
                  tooltipText: row.running ? "Pause" : "Start"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: if (root.service) root.service.toggleRule(row.modelData.id)
                }

                PanelActionButton {
                  iconText: "\uf051"
                  tooltipText: "Skip phase"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: if (root.service) root.service.skipRule(row.modelData.id)
                }

                PanelActionButton {
                  iconText: "\uf021"
                  tooltipText: "Restart"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: if (root.service) root.service.resetRule(row.modelData.id)
                }
              }

              Text {
                id: timeText
                anchors.right: actions.left
                anchors.rightMargin: Style.spacing.sm
                anchors.verticalCenter: parent.verticalCenter
                text: row.active ? Model.formatClock(Model.remainingSec(row.runtime, root.nowMs)) : "--:--"
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                color: row.running ? root.foreground : root.dim
              }

              Column {
                id: labelColumn
                anchors.left: glyphText.right
                anchors.leftMargin: Style.spacing.controlGap
                anchors.right: timeText.left
                anchors.rightMargin: Style.spacing.sm
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.spacing.xxs

                Text {
                  width: parent.width
                  text: row.modelData.label
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.subtitle
                  color: root.foreground
                  elide: Text.ElideRight
                }

                Text {
                  width: parent.width
                  text: Model.phaseText(row.modelData, row.runtime)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  color: root.dim
                  elide: Text.ElideRight
                }
              }
            }
          }
        }

        PanelSeparator {
          width: parent.width
          foreground: root.foreground
        }

        Text {
          width: parent.width
          text: "space start or pause, s skip, r restart, o off"
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          color: root.dim
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
