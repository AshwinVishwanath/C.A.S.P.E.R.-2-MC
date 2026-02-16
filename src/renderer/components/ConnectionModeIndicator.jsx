var MONO = "'IBM Plex Mono','Menlo',monospace";

export function ConnectionModeIndicator({ fc_connected, gs_connected, theme }) {
  var T = theme;

  var mode, color, bgColor;
  if (gs_connected) {
    mode = "RELAY";
    color = T.accent;
    bgColor = T.accent + "22";
  } else if (fc_connected && !gs_connected) {
    mode = "DIRECT";
    color = T.warn;
    bgColor = T.warn + "22";
  } else {
    mode = "OFFLINE";
    color = T.muted;
    bgColor = T.muted + "15";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: MONO,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1,
        padding: "3px 10px",
        borderRadius: 10,
        border: "1px solid " + color + "44",
        background: bgColor,
        color: color,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          boxShadow: T.glow(color),
          flexShrink: 0,
        }}
      />
      {mode}
    </span>
  );
}
