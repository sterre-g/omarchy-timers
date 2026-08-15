import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Model.js" as Model

Item {
  id: root

  property var shell: null
  property var manifest: null

  property bool opened: false
  property string label: "Break"
  property string glyph: "\uf017"
  property int totalSec: 20
  property double endsAt: 0
  property int remainingSec: 0

  readonly property color background: Color.menu.background
  readonly property color foreground: Color.menu.text
  readonly property color scrim: Color.menu.scrim
  readonly property color border: Color.menu.border
  readonly property var borderSpec: Border.surfaceSpec("menu", "border", root.border, Math.max(1, Style.space(2)))
  readonly property string fontFamily: Style.font.menuFamily
  readonly property real progress: root.totalSec > 0 ? Math.max(0, Math.min(1, root.remainingSec / root.totalSec)) : 0

  function open(payloadJson) {
    var payload = {}
    try {
      payload = JSON.parse(payloadJson || "{}")
    } catch (e) {
      payload = {}
    }

    root.label = payload.label || "Break"
    root.glyph = payload.glyph || "\uf017"
    root.totalSec = Math.max(1, Math.round(Number(payload.seconds) || 20))
    root.remainingSec = root.totalSec
    root.endsAt = Date.now() + root.totalSec * 1000
    root.opened = true
    Qt.callLater(function () { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
  }

  function dismiss() {
    root.opened = false
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide((root.manifest && root.manifest.id) || "sterre.timers")
  }

  Timer {
    interval: 200
    running: root.opened
    repeat: true
    onTriggered: {
      root.remainingSec = Math.max(0, Math.ceil((root.endsAt - Date.now()) / 1000))
      if (root.remainingSec <= 0) root.dismiss()
    }
  }

  PanelWindow {
    id: window
    visible: root.opened
    anchors {
      top: true
      bottom: true
      left: true
      right: true
    }
    color: "transparent"
    WlrLayershell.namespace: "sterre-timers-break"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    FocusScope {
      id: keyCatcher
      anchors.fill: parent
      focus: root.opened
      Keys.onPressed: function (event) {
        root.dismiss()
        event.accepted = true
      }

      Rectangle {
        id: card
        anchors.centerIn: parent
        width: Math.min(Style.space(460), parent.width - Style.gapsOut * 4)
        implicitHeight: content.implicitHeight + Style.spacing.panelPadding * 2
        radius: Style.cornerRadius
        color: root.background
        border.width: Border.top(root.borderSpec)
        border.color: root.border

        Column {
          id: content
          anchors.centerIn: parent
          width: parent.width - Style.spacing.panelPadding * 2
          spacing: Style.spacing.lg

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.glyph
            font.family: root.fontFamily
            font.pixelSize: Style.font.displayLarge
            color: root.foreground
          }

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.label
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
            color: root.foreground
          }

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Model.formatClock(root.remainingSec)
            font.family: root.fontFamily
            font.pixelSize: Style.font.displayLarge
            color: root.foreground
          }

          Rectangle {
            width: parent.width
            height: Math.max(2, Style.space(4))
            radius: height / 2
            color: Qt.darker(root.foreground, 2.4)

            Rectangle {
              width: parent.width * root.progress
              height: parent.height
              radius: parent.radius
              color: root.foreground

              Behavior on width {
                NumberAnimation { duration: 200 }
              }
            }
          }

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Any key or click to skip"
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            color: Qt.darker(root.foreground, 1.55)
          }
        }
      }
    }
  }
}
