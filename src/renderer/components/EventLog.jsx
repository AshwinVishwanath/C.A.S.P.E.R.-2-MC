import { useEffect, useRef } from "react";

var MONO = "'IBM Plex Mono','Menlo',monospace";
var COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif";
var SANS = "'IBM Plex Sans',system-ui,sans-serif";

function eventColor(type, typeName, theme) {
  if (!type && !typeName) return theme.text;
  var tn = (typeName || "").toLowerCase();
  var t = (type || "").toLowerCase();
  // State changes
  if (tn.indexOf("state") >= 0 || t === "state_change" || t === "state")
    return theme.accent;
  // Pyro events
  if (tn.indexOf("pyro") >= 0 || t === "pyro" || t === "pyro_fire" || t === "pyro_arm")
    return theme.danger;
  // Apogee
  if (tn.indexOf("apogee") >= 0 || t === "apogee")
    return theme.accent;
  // Errors
  if (tn.indexOf("error") >= 0 || tn.indexOf("fail") >= 0 || t === "error" || t === "fault")
    return theme.danger;
  // Warnings
  if (tn.indexOf("warn") >= 0 || t === "warning")
    return theme.warn;
  // Default
  return theme.text;
}

function formatFlightTime(s) {
  if (s == null || isNaN(s)) return "T+??.?";
  var sign = s < 0 ? "-" : "+";
  var abs = Math.abs(s);
  if (abs < 100) return "T" + sign + abs.toFixed(1) + "s";
  if (abs < 600) return "T" + sign + abs.toFixed(0) + "s";
  var m = Math.floor(abs / 60);
  var sec = (abs % 60).toFixed(0);
  return "T" + sign + m + "m" + (sec < 10 ? "0" : "") + sec + "s";
}

export function EventLog({ events, theme }) {
  var T = theme;
  var scrollRef = useRef(null);

  // Auto-scroll to top (newest at top) when events change
  useEffect(function () {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events ? events.length : 0]);

  var list = events && events.length > 0 ? events.slice().reverse() : [];

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
          Event Log
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: T.muted,
          }}
        >
          {list.length} event{list.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Scrollable event list */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 200,
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {list.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 10,
              color: T.muted,
            }}
          >
            No events recorded
          </div>
        )}
        {list.map(function (ev, i) {
          var color = eventColor(ev.type, ev.type_name, T);
          return (
            <div
              key={i}
              style={{
                padding: "4px 12px",
                fontFamily: MONO,
                fontSize: 10,
                lineHeight: 1.5,
                borderBottom:
                  i < list.length - 1
                    ? "1px solid " + T.border + "44"
                    : "none",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span
                style={{
                  color: T.muted,
                  flexShrink: 0,
                  fontSize: 9,
                }}
              >
                [{formatFlightTime(ev.flight_time_s)}]
              </span>
              <span
                style={{
                  color: color,
                  fontWeight: 600,
                }}
              >
                {ev.type_name || ev.type || "EVENT"}
              </span>
              {ev.data && (
                <span
                  style={{
                    color: T.muted,
                    fontSize: 9,
                    marginLeft: "auto",
                    flexShrink: 0,
                  }}
                >
                  {typeof ev.data === "string"
                    ? ev.data
                    : JSON.stringify(ev.data)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
