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

function profileLabel(p) {
  if (p == null) return null;
  return p === 0 ? "A · SF7" : p === 1 ? "B · SF9" : String(p);
}

// The GS only reports a position once its own receiver has a fix; until then
// the packet carries 0/0, which is a real coordinate in the Gulf of Guinea and
// must not be shown as one.
function groundPosLabel(lat, lon) {
  if (lat == null || lon == null) return null;
  if (lat === 0 && lon === 0) return "NO FIX";
  return lat.toFixed(5) + ", " + lon.toFixed(5);
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

      {/* 2-column grid — every cell is backed by a real GS_MSG_STATUS (0x13)
          or GS_MSG_TELEM (0x10) field. The former "GS Battery" and "GS Temp"
          cells were removed: the 24-byte 0x13 payload carries no such fields,
          so they could only ever have rendered "--". */}
      <div
        style={{
          padding: "10px 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <StatCell
          label="Radio Profile"
          value={profileLabel(s.radio_profile)}
          theme={T}
        />
        <StatCell
          label="Link Integrity"
          value={s.integrity_pct != null ? s.integrity_pct.toFixed(1) : null}
          unit="%"
          color={intColor}
          theme={T}
        />
        <StatCell
          label="RSSI"
          value={s.rssi_dbm != null ? s.rssi_dbm.toFixed(0) : null}
          unit="dBm"
          theme={T}
        />
        <StatCell
          label="SNR"
          value={s.snr_db != null ? s.snr_db.toFixed(1) : null}
          unit="dB"
          theme={T}
        />
        <StatCell
          label="Packets RX"
          value={s.gs_rx_pkt_count != null ? s.gs_rx_pkt_count : null}
          theme={T}
        />
        <StatCell
          label="CRC Fails"
          value={s.gs_rx_crc_fail != null ? s.gs_rx_crc_fail : null}
          color={s.gs_rx_crc_fail > 0 ? T.warn : undefined}
          theme={T}
        />
        <StatCell
          label="Ground Pressure"
          value={
            s.ground_pressure_pa
              ? (s.ground_pressure_pa / 100).toFixed(1)
              : null
          }
          unit="hPa"
          theme={T}
        />
        <StatCell
          label="GS Position"
          value={groundPosLabel(s.ground_lat_deg, s.ground_lon_deg)}
          theme={T}
        />
      </div>
    </div>
  );
}
