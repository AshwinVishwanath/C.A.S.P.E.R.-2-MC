import { useEffect, useRef } from "react";

var MONO = "'IBM Plex Mono','Menlo',monospace";

export function InlineError({ message, onDismiss, theme }) {
  var T = theme;
  var timerRef = useRef(null);

  // Auto-dismiss after 5 seconds
  useEffect(
    function () {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (message && onDismiss) {
        timerRef.current = setTimeout(function () {
          onDismiss();
        }, 5000);
      }
      return function () {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    },
    [message, onDismiss]
  );

  if (!message) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 4,
        border: "1px solid " + T.danger + "44",
        background: T.danger + "18",
        fontFamily: MONO,
        fontSize: 10,
        color: T.danger,
        animation: "fadeUp 0.15s ease-out",
      }}
    >
      <span style={{ flexShrink: 0, fontSize: 12 }}>{"\u26A0"}</span>
      <span
        style={{
          flex: 1,
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {message}
      </span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            color: T.danger,
            cursor: "pointer",
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            padding: "0 2px",
            lineHeight: 1,
            opacity: 0.7,
          }}
        >
          {"\u00D7"}
        </button>
      )}
    </div>
  );
}
