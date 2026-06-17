// CASPER 2 — Inline SVG icon set. No emojis anywhere.
// 16x16 viewBox, currentColor, stroke 1.5 default.

export default function Icon({ name, size = 16, stroke = 1.5, fill = "none", style }) {
  const props = {
    width: size, height: size, viewBox: "0 0 16 16",
    fill, stroke: "currentColor", strokeWidth: stroke,
    strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", ...style },
  };
  switch (name) {
    case "setup":    return <svg {...props}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>;
    case "test":     return <svg {...props}><path d="M3 2v5l3 4v3h4v-3l3-4V2"/><path d="M3 2h10"/><path d="M5.5 9h5"/></svg>;
    case "flight":   return <svg {...props}><path d="M8 1.5l3 6.5v6l-3-1.5-3 1.5v-6z"/><path d="M5 11l-2 1M11 11l2 1"/></svg>;
    case "track":    return <svg {...props}><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/><path d="M8 2v3M8 11v3M2 8h3M11 8h3"/></svg>;
    case "lab":      return <svg {...props}><path d="M5.5 1.5v4l-3 7a1.5 1.5 0 0 0 1.4 2h8.2a1.5 1.5 0 0 0 1.4-2l-3-7v-4"/><path d="M4.5 1.5h7"/><path d="M4.2 9.5h7.6"/></svg>;
    case "power":    return <svg {...props}><path d="M5.5 3a5 5 0 1 0 5 0"/><path d="M8 1.5v6"/></svg>;
    case "sun":      return <svg {...props}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>;
    case "moon":     return <svg {...props}><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" fill="currentColor"/></svg>;
    case "upload":   return <svg {...props}><path d="M8 11V2M4 5.5L8 1.5l4 4M2.5 13.5h11"/></svg>;
    case "download": return <svg {...props}><path d="M8 2v9M4 7.5L8 11.5l4-4M2.5 13.5h11"/></svg>;
    case "check":    return <svg {...props}><path d="M3 8l3.5 3.5L13 4.5"/></svg>;
    case "x":        return <svg {...props}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>;
    case "alert":    return <svg {...props}><path d="M8 1.5L14.5 13H1.5z"/><path d="M8 6v3"/><circle cx="8" cy="11.2" r="0.6" fill="currentColor"/></svg>;
    case "lock":     return <svg {...props}><rect x="3" y="7" width="10" height="7" rx="0.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>;
    case "unlock":   return <svg {...props}><rect x="3" y="7" width="10" height="7" rx="0.5"/><path d="M5 7V5a3 3 0 0 1 6 0"/></svg>;
    case "play":     return <svg {...props} fill="currentColor" stroke="none"><path d="M3.5 2.5v11l9-5.5z"/></svg>;
    case "pause":    return <svg {...props} fill="currentColor" stroke="none"><rect x="4" y="2.5" width="2.5" height="11"/><rect x="9.5" y="2.5" width="2.5" height="11"/></svg>;
    case "signal":   return <svg {...props}><path d="M2 13h2v-3H2zM6 13h2v-6H6zM10 13h2v-9h-2z"/></svg>;
    case "battery":  return <svg {...props}><rect x="1.5" y="5" width="11" height="6"/><rect x="13" y="6.5" width="1.5" height="3" fill="currentColor" stroke="none"/><rect x="3" y="6.5" width="6" height="3" fill="currentColor" stroke="none"/></svg>;
    case "wave":     return <svg {...props}><path d="M1 8c1.5-3 3-3 4 0s2.5 3 4 0 2.5-3 4 0"/></svg>;
    case "satellite":return <svg {...props}><circle cx="8" cy="8" r="2"/><path d="M8 4v-2.5M8 12v2.5M4 8h-2.5M12 8h2.5"/><path d="M8 8 11.5 4.5M8 8 4.5 11.5"/></svg>;
    case "chip":     return <svg {...props}><rect x="3" y="3" width="10" height="10" rx="0.5"/><path d="M5 3v-2M8 3v-2M11 3v-2M5 13v2M8 13v2M11 13v2M3 5h-2M3 8h-2M3 11h-2M13 5h2M13 8h2M13 11h2"/><rect x="6" y="6" width="4" height="4"/></svg>;
    case "gear":     return <svg {...props}><path d="M8 1.5l1 1.6 1.8-.4.4 1.8 1.6 1-1 1.6 1 1.6-1.6 1-.4 1.8-1.8-.4-1 1.6-1-1.6-1.8.4-.4-1.8-1.6-1 1-1.6-1-1.6 1.6-1 .4-1.8 1.8.4z"/><circle cx="8" cy="8" r="2"/></svg>;
    case "abort":    return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M4 4l8 8"/></svg>;
    case "fire":     return <svg {...props}><path d="M8 1.5c0 3-3 3-3 6.5a3 3 0 0 0 6 0c0-1.5-1-2.5-1-4 1 1 2 2 2 3.5a4 4 0 0 1-8 0c0-3.5 4-3 4-6z"/></svg>;
    default: return null;
  }
}
