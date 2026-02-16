var MONO = "'IBM Plex Mono','Menlo',monospace";
var COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif";

function integrityColor(pct, theme) {
  if (pct == null || isNaN(pct)) return theme.muted;
  if (pct > 95) return theme.accent;
  if (pct > 80) return theme.warn;
  return theme.danger;
}

function StatCell({ label, value, unit, color, theme }) {
  var T = theme;
  return (
    <div
      style={{
        padding: "6px 8px",
        borderRadius: 3,
        background: T.bgEl,
        border: "1px solid " + T.border + "44",
      }}
    >
      <div
        style={{
          fontFamily: COND,
          fontSize: 8,
          fontWeight: 600,
          color: T.muted,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: 700,
          color: color || T.strong,
        }}
      >
        {value != null ? value : "--"}
        {unit && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: T.muted,
              marginLeft: 2,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function GsStatusPanel({ snapshot, theme }) {
  var T = theme;
  var s = snapshot || {};

  var intColor = integrityColor(s.integrity_pct, T);

  return (
    <div
      style={{
        background: T.bgPanel,
        border: "1px solid " + T.border,
        borderRadius: 5,
        overflow: "hidden",
        boxShadow: T.shadow,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "7px 12px",
          borderBottom: "1px solid " + T.border,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: T.bgEl,
        }}
      >
        <span
          style={{
            fontFamily: COND,
            fontSize: 10.5,
            fontWeight: 600,
            color: T.muted,
            textTransform: "uppercase",
            letterSpacing: 1.8,
          }}
        >
          Ground Station
        </span>
      </div>

      {/* 2-column grid */}
      <div
        style={{
          padding: "10px 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <StatCell
          label="GS Battery"
          value={s.gs_batt_v != null ? s.gs_batt_v.toFixed(2) : null}
          unit="V"
          theme={T}
        />
        <StatCell
          label="GS Temp"
          value={s.gs_temp_c != null ? s.gs_temp_c.toFixed(1) : null}
          unit={"\u00B0C"}
          theme={T}
        />
        <StatCell
          label="Radio Profile"
          value={s.radio_profile != null ? s.radio_profile : null}
          theme={T}
        />
        <StatCell
          label="Packets RX"
          value={s.pkt_rx_count != null ? s.pkt_rx_count : null}
          theme={T}
        />
        <StatCell
          label="Packets Lost"
          value={s.pkt_lost != null ? s.pkt_lost : null}
          color={s.pkt_lost > 0 ? T.warn : undefined}
          theme={T}
        />
        <StatCell
          label="Link Integrity"
          value={
            s.integrity_pct != null ? s.integrity_pct.toFixed(1) : null
          }
          unit="%"
          color={intColor}
          theme={T}
        />
      </div>
    </div>
  );
}
