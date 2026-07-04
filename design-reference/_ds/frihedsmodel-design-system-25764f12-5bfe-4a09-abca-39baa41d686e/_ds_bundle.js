/* @ds-bundle: {"format":3,"namespace":"FrihedsmodelDesignSystem_25764f","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"ICON_NAMES","sourcePath":"components/core/Icon.jsx"},{"name":"Stat","sourcePath":"components/core/Stat.jsx"},{"name":"StatusBadge","sourcePath":"components/core/StatusBadge.jsx"},{"name":"HorizonChart","sourcePath":"components/dataviz/HorizonChart.jsx"},{"name":"Callout","sourcePath":"components/feedback/Callout.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Lever","sourcePath":"components/forms/Lever.jsx"},{"name":"Segmented","sourcePath":"components/forms/Segmented.jsx"}],"sourceHashes":{"components/core/Button.jsx":"d4da08e0c55f","components/core/Card.jsx":"f20ce3f5a596","components/core/Icon.jsx":"db8a268f724d","components/core/Stat.jsx":"554c11636148","components/core/StatusBadge.jsx":"fe1c617a0219","components/dataviz/HorizonChart.jsx":"b2ecdc373fb6","components/feedback/Callout.jsx":"7bc6a641b333","components/feedback/Tooltip.jsx":"33beecb128e8","components/forms/Field.jsx":"63a5ac07f75c","components/forms/Lever.jsx":"58c469087a82","components/forms/Segmented.jsx":"ace5fb7552f7","ui_kits/frihedsmodel-public/BrandBar.jsx":"c7b04024f1c5","ui_kits/frihedsmodel-public/FormScreen.jsx":"1a5f4fca256a","ui_kits/frihedsmodel-public/ResultScreen.jsx":"40dcbe3e103e","ui_kits/frihedsmodel-public/Welcome.jsx":"3d9ffcf4128c","ui_kits/frihedsmodel-public/app.jsx":"cb2ee8672a68","ui_kits/frihedsmodel-public/finance.js":"01122921148f","ui_kits/frihedsmodel-public/icons.jsx":"c3b562079fcf"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FrihedsmodelDesignSystem_25764f = window.FrihedsmodelDesignSystem_25764f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the primary action control.
 * Variants: primary (deep teal), accent (dawn/honey — the one warm moment, use
 * rarely), secondary (outline), ghost. Sizes: sm | md | lg. Renders as <a> when
 * href is set. Self-contained: injects its own hover/focus CSS once.
 */
const FM_BTN_CSS = `
.fm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--font-body);font-weight:600;line-height:1;border:1px solid transparent;border-radius:var(--radius);cursor:pointer;text-decoration:none;white-space:nowrap;transition:background var(--dur) var(--ease-out),border-color var(--dur) var(--ease-out),color var(--dur) var(--ease-out);}
.fm-btn:focus-visible{outline:none;box-shadow:0 0 0 var(--ring-width) var(--ring-color);}
.fm-btn:active:not([disabled]){transform:translateY(1px);}
.fm-btn[disabled]{opacity:.5;cursor:not-allowed;}
.fm-btn svg{width:18px;height:18px;flex:none;}
.fm-btn--primary{background:var(--fjord);color:var(--paper);}
.fm-btn--primary:hover:not([disabled]){background:var(--fjord-deep);}
.fm-btn--accent{background:var(--dawn);color:var(--text-on-dawn);}
.fm-btn--accent:hover:not([disabled]){background:var(--dawn-deep);}
.fm-btn--secondary{background:var(--surface-card);color:var(--fjord);border-color:var(--border-strong);}
.fm-btn--secondary:hover:not([disabled]){background:var(--fjord-soft);border-color:var(--fjord);}
.fm-btn--ghost{background:transparent;color:var(--fjord);}
.fm-btn--ghost:hover:not([disabled]){background:var(--fjord-soft);}
.fm-btn--sm{font-size:14px;padding:9px 16px;border-radius:var(--radius-sm);}
.fm-btn--md{font-size:15px;padding:13px 22px;}
.fm-btn--lg{font-size:16px;padding:15px 26px;}
.fm-btn--block{display:flex;width:100%;}
`;
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("fm-btn-css")) return;
  const s = document.createElement("style");
  s.id = "fm-btn-css";
  s.textContent = FM_BTN_CSS;
  document.head.appendChild(s);
}
function Button({
  variant = "primary",
  size = "md",
  block = false,
  href,
  icon,
  iconRight,
  children,
  className = "",
  ...props
}) {
  ensureStyles();
  const cls = ["fm-btn", `fm-btn--${variant}`, `fm-btn--${size}`, block ? "fm-btn--block" : "", className].filter(Boolean).join(" ");
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, icon, children != null && /*#__PURE__*/React.createElement("span", null, children), iconRight);
  if (href) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href,
      className: cls
    }, props), inner);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls
  }, props), inner);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the default surface. Soft hairline border, 16px radius, quiet shadow.
 * padding: none | sm | md | lg | xl. `raised` swaps the resting hairline shadow
 * for the soft card shadow.
 */
function Card({
  padding = "lg",
  raised = false,
  as = "div",
  children,
  style = {},
  ...rest
}) {
  const Tag = as;
  const pad = {
    none: "0",
    sm: "14px",
    md: "18px",
    lg: "22px",
    xl: "28px"
  }[padding] ?? "22px";
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--radius-lg)",
      padding: pad,
      boxShadow: raised ? "var(--shadow-card)" : "var(--shadow-xs)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon — the Frihedsmodel icon set. Calm 2px stroke, currentColor, rounded
 * joins, to sit comfortably beside Public Sans. Pass `name` plus an optional
 * `size`/`strokeWidth`. Inherits colour from the surrounding text.
 *
 * Lucide-derived geometry (ISC licensed), tuned to the brand stroke.
 */
const PATHS = {
  // wayfinding
  "arrow-right": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "5",
    y1: "12",
    x2: "19",
    y2: "12"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "12 5 19 12 12 19"
  })),
  "arrow-left": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "19",
    y1: "12",
    x2: "5",
    y2: "12"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "12 19 5 12 12 5"
  })),
  "arrow-up-right": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "7",
    y1: "17",
    x2: "17",
    y2: "7"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "7 7 17 7 17 17"
  })),
  "chevron-right": /*#__PURE__*/React.createElement("polyline", {
    points: "9 18 15 12 9 6"
  }),
  "chevron-down": /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  }),
  "external": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "15 3 21 3 21 9"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "10",
    y1: "14",
    x2: "21",
    y2: "3"
  })),
  // explanation layer
  "info": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "16",
    x2: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "8",
    x2: "12.01",
    y2: "8"
  })),
  "help": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "17",
    x2: "12.01",
    y2: "17"
  })),
  "alert": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "9",
    x2: "12",
    y2: "13"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "17",
    x2: "12.01",
    y2: "17"
  })),
  "check": /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }),
  "check-circle": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M22 11.08V12a10 10 0 1 1-5.93-9.14"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "22 4 12 14.01 9 11.01"
  })),
  "x": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })),
  // controls & money
  "sliders": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "4",
    y1: "21",
    x2: "4",
    y2: "14"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4",
    y1: "10",
    x2: "4",
    y2: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "21",
    x2: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "8",
    x2: "12",
    y2: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "21",
    x2: "20",
    y2: "16"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "12",
    x2: "20",
    y2: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "1",
    y1: "14",
    x2: "7",
    y2: "14"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "9",
    y1: "8",
    x2: "15",
    y2: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "17",
    y1: "16",
    x2: "23",
    y2: "16"
  })),
  "plus": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "5",
    x2: "12",
    y2: "19"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "5",
    y1: "12",
    x2: "19",
    y2: "12"
  })),
  "minus": /*#__PURE__*/React.createElement("line", {
    x1: "5",
    y1: "12",
    x2: "19",
    y2: "12"
  }),
  "download": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "7 10 12 15 17 10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "15",
    x2: "12",
    y2: "3"
  })),
  "share": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 6 12 2 8 6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "2",
    x2: "12",
    y2: "15"
  })),
  "wallet": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 12V7H5a2 2 0 0 1 0-4h14v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 5v14a2 2 0 0 0 2 2h16v-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 12a2 2 0 0 0 0 4h4v-4Z"
  })),
  "calendar": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "2",
    ry: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    y1: "2",
    x2: "16",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "8",
    y1: "2",
    x2: "8",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "10",
    x2: "21",
    y2: "10"
  })),
  "trending-up": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
    points: "23 6 13.5 15.5 8.5 10.5 1 18"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "17 6 23 6 23 12"
  })),
  // brand & account
  "sunrise": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M17 18a5 5 0 0 0-10 0"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "2",
    x2: "12",
    y2: "9"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4.22",
    y1: "10.22",
    x2: "5.64",
    y2: "11.64"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "1",
    y1: "18",
    x2: "3",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "18",
    x2: "23",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "18.36",
    y1: "11.64",
    x2: "19.78",
    y2: "10.22"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "23",
    y1: "22",
    x2: "1",
    y2: "22"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "8 6 12 2 16 6"
  })),
  "compass": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
  })),
  "shield": /*#__PURE__*/React.createElement("path", {
    d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
  }),
  "lock": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "11",
    width: "18",
    height: "11",
    rx: "2",
    ry: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 11V7a5 5 0 0 1 10 0v4"
  })),
  "user": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  })),
  "mail": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "4",
    width: "20",
    height: "16",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 7-10 5L2 7"
  }))
};
function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  title,
  style = {},
  ...rest
}) {
  const body = PATHS[name];
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    role: title ? "img" : undefined,
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
    style: {
      display: "inline-block",
      flex: "none",
      verticalAlign: "middle",
      ...style
    }
  }, rest), title && /*#__PURE__*/React.createElement("title", null, title), body || null);
}

/** The list of available icon names (handy for tooling/specimens). */
const ICON_NAMES = Object.keys(PATHS);
Object.assign(__ds_scope, { Icon, ICON_NAMES });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Stat.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * KPI stat — an uppercase label, a serif result number (tabular), and a quiet sub.
 * Numbers sit in Spectral for warmth. Use "ok" tone to mark a reassuring result.
 */
function Stat({
  label,
  value,
  sub,
  tone = "default",
  style = {},
  ...rest
}) {
  const valueColor = {
    default: "var(--ink)",
    ok: "var(--sage)",
    risk: "var(--clay)",
    accent: "var(--dawn-deep)"
  }[tone] || "var(--ink)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "13px",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--ink-faint)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 400,
      fontSize: "30px",
      lineHeight: 1.1,
      letterSpacing: "-0.01em",
      fontVariantNumeric: "tabular-nums",
      color: valueColor,
      margin: "8px 0 3px"
    }
  }, value), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "14.5px",
      color: "var(--ink-soft)"
    }
  }, sub));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Stat.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusBadge — a muted pill communicating plan health.
 * status: ontrack ("På sporet") | tight ("Lidt stramt") | risk ("Pas på").
 * Never neon; tones are deliberately soft to avoid alarm.
 */
function StatusBadge({
  status = "ontrack",
  children,
  style = {},
  ...rest
}) {
  const map = {
    ontrack: {
      c: "var(--sage)",
      bg: "var(--sage-soft)",
      b: "var(--sage-line)"
    },
    tight: {
      c: "var(--dawn-deep)",
      bg: "var(--amber-soft)",
      b: "var(--amber-line)"
    },
    risk: {
      c: "var(--clay)",
      bg: "var(--clay-soft)",
      b: "var(--clay-line)"
    }
  };
  const t = map[status] || map.ontrack;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      fontFamily: "var(--font-body)",
      fontSize: "13px",
      fontWeight: 600,
      letterSpacing: "0.02em",
      color: t.c,
      background: t.bg,
      border: `1px solid ${t.b}`,
      borderRadius: "var(--radius-pill)",
      padding: "5px 12px 5px 10px",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: t.c,
      flex: "none"
    }
  }), children);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/dataviz/HorizonChart.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * HorizonChart — Frihedsmodel's signature element.
 * A calm net-worth-over-a-lifetime curve from today to life expectancy, with the
 * earliest age you can stop working marked like a small sunrise (the one warm accent).
 * Everything else stays quiet: soft fill, hairline baseline, a faint dashed "plan" tick.
 *
 * data: [{ age:number, value:number }, ...] sorted by age.
 */
function HorizonChart({
  data = [],
  freedomAge = null,
  planAge = null,
  freedomLabel = "Frihedspunkt",
  planLabel = "Din plan",
  height = 320,
  ariaLabel,
  style = {},
  ...rest
}) {
  const W = 900,
    H = 340;
  const padL = 40,
    padR = 40,
    padT = 28,
    padB = 50;
  if (!data.length) return /*#__PURE__*/React.createElement("div", _extends({
    style: style
  }, rest));
  const ages = data.map(d => d.age);
  const vals = data.map(d => d.value);
  const minAge = Math.min(...ages),
    maxAge = Math.max(...ages);
  const maxVal = Math.max(...vals) * 1.08,
    minVal = 0;
  const x = age => padL + (age - minAge) / (maxAge - minAge) * (W - padL - padR);
  const y = v => H - padB - (v - minVal) / (maxVal - minVal) * (H - padT - padB);
  const linePts = data.map(d => `${x(d.age).toFixed(1)},${y(d.value).toFixed(1)}`);
  const linePath = "M" + linePts.join(" L");
  const areaPath = `M${x(data[0].age).toFixed(1)},${y(data[0].value).toFixed(1)} L` + linePts.slice(1).join(" L") + ` L${x(maxAge).toFixed(1)},${(H - padB).toFixed(1)} L${x(minAge).toFixed(1)},${(H - padB).toFixed(1)} Z`;

  // freedom point y on the curve (interpolate)
  const valueAt = age => {
    if (age <= data[0].age) return data[0].value;
    if (age >= data[data.length - 1].age) return data[data.length - 1].value;
    for (let i = 1; i < data.length; i++) {
      if (age <= data[i].age) {
        const a = data[i - 1],
          b = data[i];
        const t = (age - a.age) / (b.age - a.age);
        return a.value + t * (b.value - a.value);
      }
    }
    return data[data.length - 1].value;
  };
  const uid = React.useId ? React.useId().replace(/:/g, "") : "hz" + Math.random().toString(36).slice(2, 7);
  return /*#__PURE__*/React.createElement("svg", _extends({
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": ariaLabel || "Formue over tid med frihedspunkt markeret som en lille solopgang.",
    style: {
      width: "100%",
      height: "auto",
      display: "block",
      overflow: "visible",
      maxHeight: height,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: `fill-${uid}`,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "var(--fjord)",
    stopOpacity: "0.13"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "var(--fjord)",
    stopOpacity: "0.01"
  })), /*#__PURE__*/React.createElement("radialGradient", {
    id: `glow-${uid}`,
    cx: "50%",
    cy: "50%",
    r: "50%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "var(--dawn)",
    stopOpacity: "0.45"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "var(--dawn)",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("line", {
    x1: padL,
    y1: H - padB,
    x2: W - padR,
    y2: H - padB,
    stroke: "var(--chart-grid)",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: areaPath,
    fill: `url(#fill-${uid})`
  }), planAge != null && /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("line", {
    x1: x(planAge),
    y1: H - padB,
    x2: x(planAge),
    y2: y(valueAt(planAge)) - 4,
    stroke: "var(--ink-faint)",
    strokeWidth: "1",
    strokeDasharray: "3 4",
    opacity: "0.5"
  }), /*#__PURE__*/React.createElement("text", {
    x: x(planAge) + 8,
    y: y(valueAt(planAge)) + 4,
    fontFamily: "var(--font-body)",
    fontSize: "12",
    fontWeight: "500",
    fill: "var(--ink-faint)"
  }, planLabel, " ", planAge)), /*#__PURE__*/React.createElement("path", {
    d: linePath,
    fill: "none",
    stroke: "var(--chart-line)",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), freedomAge != null && /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("line", {
    x1: x(freedomAge),
    y1: H - padB,
    x2: x(freedomAge),
    y2: y(valueAt(freedomAge)),
    stroke: "var(--chart-freedom)",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: x(freedomAge),
    cy: y(valueAt(freedomAge)),
    r: "22",
    fill: `url(#glow-${uid})`
  }), /*#__PURE__*/React.createElement("circle", {
    cx: x(freedomAge),
    cy: y(valueAt(freedomAge)),
    r: "7",
    fill: "var(--chart-freedom)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: x(freedomAge),
    cy: y(valueAt(freedomAge)),
    r: "7",
    fill: "none",
    stroke: "var(--paper)",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("text", {
    x: x(freedomAge),
    y: y(valueAt(freedomAge)) - 21,
    textAnchor: "middle",
    fontFamily: "var(--font-body)",
    fontSize: "13",
    fontWeight: "600",
    fill: "var(--dawn-deep)"
  }, freedomLabel, " ", freedomAge)), /*#__PURE__*/React.createElement("text", {
    x: padL,
    y: H - padB + 22,
    fontFamily: "var(--font-body)",
    fontSize: "12.5",
    fontWeight: "500",
    fill: "var(--ink-faint)"
  }, "I dag, ", minAge, " \xE5r"), /*#__PURE__*/React.createElement("text", {
    x: W - padR,
    y: H - padB + 22,
    textAnchor: "end",
    fontFamily: "var(--font-body)",
    fontSize: "12.5",
    fontWeight: "500",
    fill: "var(--ink-faint)"
  }, maxAge, " \xE5r"));
}
Object.assign(__ds_scope, { HorizonChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dataviz/HorizonChart.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Callout — the trust & explanation layer. Calm, never alarmist.
 * Use for "how is this calculated?", real-terms notes, and gentle cautions.
 * tone: info (fjord), neutral (paper), caution (clay). Pass your own icon node.
 */
function Callout({
  tone = "info",
  title,
  children,
  icon = null,
  style = {},
  ...rest
}) {
  const tones = {
    info: {
      bg: "var(--fjord-soft)",
      line: "var(--fjord-soft)",
      accent: "var(--fjord)",
      text: "var(--ink)"
    },
    neutral: {
      bg: "var(--paper-sunk)",
      line: "var(--border-soft)",
      accent: "var(--ink-faint)",
      text: "var(--ink)"
    },
    caution: {
      bg: "var(--clay-soft)",
      line: "var(--clay-line)",
      accent: "var(--clay)",
      text: "var(--ink)"
    },
    accent: {
      bg: "var(--dawn-soft)",
      line: "var(--amber-line)",
      accent: "var(--dawn-deep)",
      text: "var(--ink)"
    }
  };
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      gap: "12px",
      background: t.bg,
      border: `1px solid ${t.line}`,
      borderRadius: "var(--radius-md)",
      padding: "14px 16px",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.accent,
      flex: "none",
      marginTop: "1px",
      display: "inline-flex"
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "14.5px",
      fontWeight: 700,
      color: t.text,
      marginBottom: "3px"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      lineHeight: 1.5,
      color: "var(--ink-soft)"
    }
  }, children)));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Callout.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tooltip — the small explanation affordance. Shows on hover and keyboard
 * focus, toggles on click/tap, closes on Escape. Calm dark bubble with an
 * arrow. With no children it renders a default info-dot trigger, so it doubles
 * as the "info icon" beside a label.
 *
 * <Tooltip label="Realt, efter inflation." />               // info dot
 * <Tooltip label="Forklaring"><button>Hvorfor?</button></Tooltip>
 */
function Tooltip({
  label,
  children,
  placement = "top",
  maxWidth = 248,
  style = {},
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const reactId = React.useId ? React.useId() : "fm-tip";
  const tipId = `tip-${reactId.replace(/:/g, "")}`;
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const toggle = () => setOpen(o => !o);
  const defaultTrigger = /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Mere info",
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      padding: 0,
      borderRadius: "50%",
      border: `1px solid ${open ? "var(--fjord)" : "var(--border-strong)"}`,
      background: open ? "var(--fjord-soft)" : "transparent",
      color: open ? "var(--fjord)" : "var(--ink-faint)",
      cursor: "pointer",
      flex: "none",
      lineHeight: 0,
      transition: "color var(--dur) var(--ease-out), background var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "16",
    x2: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "8",
    x2: "12.01",
    y2: "8"
  })));
  const triggerEl = React.isValidElement(children) ? children : children != null ? /*#__PURE__*/React.createElement("span", null, children) : defaultTrigger;
  const trigger = React.cloneElement(triggerEl, {
    "aria-describedby": open ? tipId : undefined,
    onFocus: e => {
      triggerEl.props.onFocus && triggerEl.props.onFocus(e);
      show();
    },
    onBlur: e => {
      triggerEl.props.onBlur && triggerEl.props.onBlur(e);
      hide();
    },
    onClick: e => {
      triggerEl.props.onClick && triggerEl.props.onClick(e);
      toggle();
    },
    onMouseDown: e => {
      triggerEl.props.onMouseDown && triggerEl.props.onMouseDown(e);
      e.preventDefault();
    },
    onKeyDown: e => {
      triggerEl.props.onKeyDown && triggerEl.props.onKeyDown(e);
      if (e.key === "Escape") hide();
    }
  });
  const bubblePos = placement === "bottom" ? {
    top: "calc(100% + 8px)"
  } : {
    bottom: "calc(100% + 8px)"
  };
  const arrowPos = placement === "bottom" ? {
    bottom: "100%",
    borderBottom: "6px solid var(--ink)"
  } : {
    top: "100%",
    borderTop: "6px solid var(--ink)"
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: "relative",
      display: "inline-flex",
      verticalAlign: "middle",
      ...style
    },
    onMouseEnter: show,
    onMouseLeave: hide
  }, rest), trigger, open && /*#__PURE__*/React.createElement("span", {
    id: tipId,
    role: "tooltip",
    style: {
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)",
      ...bubblePos,
      width: `min(${maxWidth}px, 72vw)`,
      zIndex: 30,
      background: "var(--ink)",
      color: "var(--paper)",
      fontFamily: "var(--font-body)",
      fontSize: "13px",
      lineHeight: 1.45,
      fontWeight: 400,
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: "var(--radius-sm)",
      boxShadow: "var(--shadow-card)",
      letterSpacing: 0
    }
  }, label, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)",
      width: 0,
      height: 0,
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      ...arrowPos
    }
  })));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Field — a labelled input with optional unit suffix/prefix and helper text.
 * Numeric type right-aligns and uses tabular figures. Visible focus ring.
 */
function Field({
  label,
  value,
  onChange,
  type = "text",
  suffix,
  prefix,
  help,
  disabled = false,
  id,
  style = {},
  ...rest
}) {
  const fid = id || (label ? `field-${String(label).replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const isNum = type === "number";
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fid,
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center"
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: "14px",
      color: "var(--ink-faint)",
      fontSize: "15px",
      pointerEvents: "none"
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    type: type,
    value: value,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "15px",
      color: "var(--ink)",
      background: disabled ? "var(--paper-sunk)" : "var(--surface-card)",
      border: `1.5px solid ${focus ? "var(--fjord)" : "var(--border-soft)"}`,
      borderRadius: "var(--radius)",
      padding: `11px ${suffix ? "44px" : "14px"} 11px ${prefix ? "30px" : "14px"}`,
      width: "100%",
      textAlign: isNum ? "right" : "left",
      fontVariantNumeric: isNum ? "tabular-nums" : "normal",
      boxShadow: focus ? "0 0 0 var(--ring-width) var(--ring-color)" : "none",
      outline: "none",
      transition: "border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out)",
      opacity: disabled ? 0.6 : 1
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: "14px",
      color: "var(--ink-faint)",
      fontSize: "14px",
      pointerEvents: "none"
    }
  }, suffix)), help && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "13px",
      color: "var(--ink-faint)"
    }
  }, help));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Lever.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lever slider — the "feel the trade-off" control. Fjord fill, dawn thumb ring on focus.
 * Shows the live value (formatted) beside the label. Respects keyboard focus.
 */
function Lever({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  format = v => v,
  id,
  style = {},
  ...rest
}) {
  const fid = id || (label ? `lever-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const pct = (Number(value) - min) / (max - min) * 100;
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline"
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fid,
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "19px",
      color: "var(--fjord)",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.01em"
    }
  }, format(value))), /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    type: "range",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      WebkitAppearance: "none",
      appearance: "none",
      width: "100%",
      height: "6px",
      borderRadius: "999px",
      outline: "none",
      cursor: "pointer",
      background: `linear-gradient(to right, var(--fjord) 0%, var(--fjord) ${pct}%, var(--paper-sunk) ${pct}%, var(--paper-sunk) 100%)`,
      boxShadow: focus ? "0 0 0 3px var(--ring-color)" : "none"
    }
  }, rest)), /*#__PURE__*/React.createElement("style", null, `
        #${fid}::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:20px; height:20px; border-radius:50%; background:var(--surface-raised); border:2px solid var(--fjord); box-shadow:var(--shadow-sm); cursor:pointer; transition:transform var(--dur-fast) var(--ease-out); }
        #${fid}::-webkit-slider-thumb:active{ transform:scale(0.94); }
        #${fid}::-moz-range-thumb{ width:18px; height:18px; border-radius:50%; background:var(--surface-raised); border:2px solid var(--fjord); box-shadow:var(--shadow-sm); cursor:pointer; }
      `));
}
Object.assign(__ds_scope, { Lever });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Lever.jsx", error: String((e && e.message) || e) }); }

// components/forms/Segmented.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Segmented control — a calm toggle for 2-3 options (e.g. Simpel / Avanceret).
 * The selected segment gets a raised white surface; the track is a sunk well.
 */
function Segmented({
  options = [],
  value,
  onChange,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "inline-flex",
      background: "var(--paper-sunk)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--radius)",
      padding: "3px",
      gap: "3px",
      ...style
    }
  }, rest), options.map(opt => {
    const val = typeof opt === "string" ? opt : opt.value;
    const lab = typeof opt === "string" ? opt : opt.label;
    const selected = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      role: "tab",
      "aria-selected": selected,
      onClick: () => onChange && onChange(val),
      style: {
        fontFamily: "var(--font-body)",
        fontSize: "14.5px",
        fontWeight: 600,
        color: selected ? "var(--fjord)" : "var(--ink-soft)",
        background: selected ? "var(--surface-raised)" : "transparent",
        border: selected ? "1px solid var(--border-soft)" : "1px solid transparent",
        boxShadow: selected ? "var(--shadow-xs)" : "none",
        borderRadius: "var(--radius-sm)",
        padding: "8px 16px",
        cursor: "pointer",
        transition: "color var(--dur) var(--ease-out), background var(--dur) var(--ease-out)"
      }
    }, lab);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Segmented.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/BrandBar.jsx
try { (() => {
/* Shared top bar: sunrise mark + Spectral wordmark + a context action. */
function BrandBar({
  action
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "26px 0 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      background: "radial-gradient(circle at 35% 35%, var(--dawn-glow), var(--dawn))",
      boxShadow: "0 0 0 4px var(--dawn-soft)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: "21px",
      letterSpacing: "-0.01em",
      color: "var(--ink)"
    }
  }, "Frihedsmodel")), action);
}
window.BrandBar = BrandBar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/BrandBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/FormScreen.jsx
try { (() => {
/* Form — one-screen core inputs, prefilled with sensible defaults. */
function FormScreen({
  values,
  setValue,
  onSubmit,
  onBack
}) {
  const {
    Button,
    Field,
    Segmented,
    Callout
  } = window.FrihedsmodelDesignSystem_25764f;
  const [mode, setMode] = React.useState("Simpel");
  const num = k => e => setValue(k, Number(e.target.value));
  const label = {
    fontFamily: "var(--font-body)"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "760px",
      margin: "0 auto",
      padding: "0 var(--gutter)"
    }
  }, /*#__PURE__*/React.createElement(BrandBar, {
    action: /*#__PURE__*/React.createElement("button", {
      onClick: onBack,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: "14.5px",
        fontWeight: 500,
        color: "var(--fjord)"
      }
    }, /*#__PURE__*/React.createElement(ArrowLeft, {
      size: 16
    }), " Tilbage")
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "clamp(36px,6vw,60px) 0 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "20px",
      flexWrap: "wrap",
      marginBottom: "14px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "12.5px",
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--ink-faint)",
      margin: 0,
      whiteSpace: "nowrap"
    }
  }, "Dine tal"), /*#__PURE__*/React.createElement(Segmented, {
    options: ["Simpel", "Avanceret"],
    value: mode,
    onChange: setMode
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 300,
      fontSize: "clamp(28px,4.5vw,40px)",
      lineHeight: 1.12,
      letterSpacing: "-0.015em",
      color: "var(--ink)",
      margin: 0,
      maxWidth: "15em"
    }
  }, "Fort\xE6l os lidt om din \xF8konomi."), mode === "Avanceret" && /*#__PURE__*/React.createElement(Callout, {
    tone: "neutral",
    icon: /*#__PURE__*/React.createElement(Info, {
      size: 18
    }),
    style: {
      marginTop: "20px"
    }
  }, "Avanceret tilstand med flere konti, skat og pensionstyper kommer senere. Vi bruger dine simple tal indtil da."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "22px 28px",
      margin: "28px 0 0"
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Nuv\xE6rende alder",
    type: "number",
    value: values.currentAge,
    onChange: num("currentAge"),
    suffix: "\xE5r"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Planl\xE6g til alder",
    type: "number",
    value: values.lifeExpectancy,
    onChange: num("lifeExpectancy"),
    suffix: "\xE5r",
    help: "Hvor l\xE6nge pengene skal r\xE6kke."
  }), /*#__PURE__*/React.createElement(Field, {
    label: "\xC5rlig indkomst",
    type: "number",
    value: values.income,
    onChange: num("income"),
    suffix: "kr",
    help: "Brutto, i nutidskroner."
  }), /*#__PURE__*/React.createElement(Field, {
    label: "M\xE5nedligt forbrug",
    type: "number",
    value: values.monthlySpend,
    onChange: num("monthlySpend"),
    suffix: "kr",
    help: "Det du regner med at bruge."
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Opsparing og investeringer",
    type: "number",
    value: values.savings,
    onChange: num("savings"),
    suffix: "kr",
    help: "Det du har investeret indtil nu."
  }), /*#__PURE__*/React.createElement(Field, {
    label: "M\xE5nedlig opsparing",
    type: "number",
    value: values.monthlySaving,
    onChange: num("monthlySaving"),
    suffix: "kr"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Pension i dag",
    type: "number",
    value: values.pension,
    onChange: num("pension"),
    suffix: "kr"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Forventet afkast",
    type: "number",
    value: values.realReturn,
    onChange: num("realReturn"),
    suffix: "%",
    help: "Realt, efter inflation. Ca. 4 til 5 % er almindeligt."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "14px",
      alignItems: "center",
      flexWrap: "wrap",
      margin: "30px 0 46px",
      paddingTop: "22px",
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(ArrowRight, {
      size: 18
    }),
    onClick: onSubmit
  }, "Se dit svar"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "13.5px",
      color: "var(--ink-faint)"
    }
  }, "Et regneeksempel, ikke \xF8konomisk r\xE5dgivning."))));
}
window.FormScreen = FormScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/FormScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/ResultScreen.jsx
try { (() => {
/* Result — the answer-first hero. Horizon signature, KPIs, live levers. */
function ResultScreen({
  values,
  setValue,
  onAdjust
}) {
  const NS = window.FrihedsmodelDesignSystem_25764f;
  const {
    Button,
    Card,
    Stat,
    StatusBadge,
    Callout,
    HorizonChart,
    Lever
  } = NS;
  const [open, setOpen] = React.useState(false);
  const r = window.FrihedsmodelFinance.project(values);
  const fmtMio = v => "ca. " + (Math.round(v * 10) / 10).toFixed(1).replace(".", ",") + " mio. kr";
  const statusLabel = {
    ontrack: "På sporet",
    tight: "Lidt stramt",
    risk: "Pas på"
  }[r.status];
  let answer, takeaway;
  if (r.freedomAge != null && r.status !== "risk") {
    answer = /*#__PURE__*/React.createElement(React.Fragment, null, "Du kan tidligst stoppe med at arbejde omkring ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fjord)",
        fontWeight: 500,
        fontStyle: "italic"
      }
    }, "alder ", r.freedomAge), ".");
    if (r.freedomAge < r.planAge) {
      takeaway = `Med dine nuværende tal rækker pengene hele vejen til ${r.lifeExpectancy}. Du kan altså stoppe et par år før din egen plan på ${r.planAge}.`;
    } else if (r.freedomAge === r.planAge) {
      takeaway = `Pengene rækker til ${r.lifeExpectancy}, præcis som din plan på ${r.planAge}. Der er ikke meget at give af.`;
    } else {
      takeaway = `Det er lidt senere end din plan på ${r.planAge}, men pengene rækker så hele vejen til ${r.lifeExpectancy}.`;
    }
  } else {
    answer = /*#__PURE__*/React.createElement(React.Fragment, null, "Med din plan p\xE5 ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fjord)",
        fontWeight: 500,
        fontStyle: "italic"
      }
    }, "alder ", r.planAge), " r\xE6kker pengene ikke hele vejen.");
    takeaway = r.firstShortfallAge != null ? `Pengene ser ud til at slippe op omkring ${r.firstShortfallAge} år. Prøv at justere forbruget eller stop-alderen herunder.` : "Prøv at justere tallene herunder, så pengene rækker længere.";
  }
  const wrap = {
    maxWidth: "920px",
    margin: "0 auto",
    padding: "0 var(--gutter)"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrap
  }, /*#__PURE__*/React.createElement(BrandBar, {
    action: /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(o => !o),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: "14.5px",
        fontWeight: 500,
        color: "var(--fjord)",
        borderBottom: "1.5px solid " + (open ? "var(--fjord)" : "transparent"),
        paddingBottom: "1px",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement(Sliders, {
      size: 16
    }), " Just\xE9r dine tal")
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "clamp(40px,7vw,72px) 0 0",
      maxWidth: "720px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "12px",
      marginBottom: "22px",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "12.5px",
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--ink-faint)",
      whiteSpace: "nowrap"
    }
  }, "Dit svar"), /*#__PURE__*/React.createElement(StatusBadge, {
    status: r.status
  }, statusLabel)), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 300,
      fontSize: "clamp(34px,6vw,56px)",
      lineHeight: 1.08,
      letterSpacing: "-0.015em",
      color: "var(--ink)",
      margin: 0
    }
  }, answer), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "clamp(17px,2.4vw,20px)",
      color: "var(--ink-soft)",
      lineHeight: 1.55,
      margin: "20px 0 0",
      maxWidth: "34em"
    }
  }, takeaway)), open && /*#__PURE__*/React.createElement(Card, {
    raised: true,
    style: {
      margin: "28px 0 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      marginBottom: "18px"
    }
  }, /*#__PURE__*/React.createElement(Sliders, {
    size: 17
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "19px",
      color: "var(--ink)"
    }
  }, "Just\xE9r og se forskellen")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "26px"
    }
  }, /*#__PURE__*/React.createElement(Lever, {
    label: "M\xE5nedligt forbrug",
    min: 12000,
    max: 45000,
    step: 500,
    value: values.monthlySpend,
    onChange: e => setValue("monthlySpend", +e.target.value),
    format: v => "ca. " + v.toLocaleString("da-DK") + " kr"
  }), /*#__PURE__*/React.createElement(Lever, {
    label: "M\xE5nedlig opsparing",
    min: 0,
    max: 25000,
    step: 500,
    value: values.monthlySaving,
    onChange: e => setValue("monthlySaving", +e.target.value),
    format: v => v.toLocaleString("da-DK") + " kr"
  }), /*#__PURE__*/React.createElement(Lever, {
    label: "Stop-alder",
    min: 50,
    max: 70,
    step: 1,
    value: values.planAge,
    onChange: e => setValue("planAge", +e.target.value),
    format: v => v + " år"
  }))), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: "clamp(22px,4vw,40px) 0 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: "10px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 400,
      fontSize: "19px",
      color: "var(--ink)",
      margin: 0
    }
  }, "Din horisont"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "13px",
      color: "var(--ink-faint)"
    }
  }, "Formue over tid, fra i dag til ", r.lifeExpectancy, " \xE5r")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-xl)",
      padding: "18px clamp(10px,2vw,22px) 12px",
      boxShadow: "var(--shadow-card)"
    }
  }, /*#__PURE__*/React.createElement(HorizonChart, {
    data: r.data,
    freedomAge: r.freedomAge,
    planAge: r.planAge
  }))), /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "14px",
      marginTop: "18px"
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Stat, {
    label: "Formue n\xE5r du stopper",
    value: fmtMio(r.capitalAtStop),
    sub: `ved din planlagte stop-alder (${r.planAge})`
  })), /*#__PURE__*/React.createElement(Card, null, r.firstShortfallAge != null ? /*#__PURE__*/React.createElement(Stat, {
    label: "Flaskehals",
    value: `omkring ${r.firstShortfallAge} år`,
    sub: r.monthlyGap > 0 ? `ca. ${r.monthlyGap.toLocaleString("da-DK")} kr/md for lidt` : "pengene slipper op",
    tone: "risk"
  }) : /*#__PURE__*/React.createElement(Stat, {
    label: "Flaskehals",
    value: "Ingen fundet",
    sub: `pengene rækker hele vejen til ${r.lifeExpectancy}`,
    tone: "ok"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      flexWrap: "wrap",
      margin: "30px 0 46px",
      paddingTop: "20px",
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onAdjust
  }, "Just\xE9r dine tal"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "13.5px",
      color: "var(--ink-faint)"
    }
  }, "Et regneeksempel, ikke \xF8konomisk r\xE5dgivning.")));
}
window.ResultScreen = ResultScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/ResultScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/Welcome.jsx
try { (() => {
/* Welcome — the short framing screen. Plain, honest, calm. */
function Welcome({
  onStart
}) {
  const {
    Button,
    Callout
  } = window.FrihedsmodelDesignSystem_25764f;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "620px",
      margin: "0 auto",
      padding: "0 var(--gutter)"
    }
  }, /*#__PURE__*/React.createElement(BrandBar, null), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "clamp(48px,9vw,96px) 0 0"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "12.5px",
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--ink-faint)",
      margin: "0 0 22px"
    }
  }, "Frihedsmodel"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 300,
      fontSize: "clamp(32px,5.5vw,50px)",
      lineHeight: 1.1,
      letterSpacing: "-0.015em",
      color: "var(--ink)",
      margin: 0
    }
  }, "Find ud af, hvorn\xE5r du har r\xE5d til at stoppe med at arbejde."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "clamp(17px,2.4vw,20px)",
      color: "var(--ink-soft)",
      lineHeight: 1.55,
      margin: "22px 0 0",
      maxWidth: "34em"
    }
  }, "Svar et par enkle sp\xF8rgsm\xE5l om din \xF8konomi. Du f\xE5r et roligt, \xE6rligt svar f\xF8rst, og kan derefter justere tallene og se, hvad der betyder mest."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "14px",
      alignItems: "center",
      flexWrap: "wrap",
      margin: "34px 0 24px"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(ArrowRight, {
      size: 18
    }),
    onClick: onStart
  }, "Kom i gang"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      color: "var(--ink-faint)"
    }
  }, "Tager under to minutter")), /*#__PURE__*/React.createElement(Callout, {
    tone: "neutral",
    icon: /*#__PURE__*/React.createElement(Info, {
      size: 18
    }),
    title: "Alle bel\xF8b er i nutidskroner",
    style: {
      marginTop: "8px"
    }
  }, "S\xE5 tallene er sammenlignelige med dagens priser. Frihedsmodel giver et regneeksempel, ikke \xF8konomisk r\xE5dgivning.")));
}
window.Welcome = Welcome;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/Welcome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/app.jsx
try { (() => {
/* App — orchestrates Welcome → Form → Result. Answer-first: opens on the result. */
const DEFAULTS = {
  currentAge: 36,
  lifeExpectancy: 90,
  income: 520000,
  monthlySpend: 29500,
  savings: 420000,
  monthlySaving: 7500,
  pension: 580000,
  realReturn: 4.5,
  planAge: 60,
  folkepensionAge: 67,
  folkepensionMonthly: 7500,
  pensionAccessAge: 65
};
const STORE_KEY = "frihedsmodel.kit.values.v1";
function App() {
  const [step, setStep] = React.useState("result"); // welcome | form | result
  const [values, setValues] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return saved ? {
        ...DEFAULTS,
        ...saved
      } : {
        ...DEFAULTS
      };
    } catch (e) {
      return {
        ...DEFAULTS
      };
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(values));
    } catch (e) {}
  }, [values]);
  const setValue = (k, v) => setValues(p => ({
    ...p,
    [k]: v
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "var(--bg-page)"
    }
  }, step === "welcome" && /*#__PURE__*/React.createElement(Welcome, {
    onStart: () => setStep("form")
  }), step === "form" && /*#__PURE__*/React.createElement(FormScreen, {
    values: values,
    setValue: setValue,
    onSubmit: () => setStep("result"),
    onBack: () => setStep("welcome")
  }), step === "result" && /*#__PURE__*/React.createElement(ResultScreen, {
    values: values,
    setValue: setValue,
    onAdjust: () => setStep("form")
  }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/finance.js
try { (() => {
/* Frihedsmodel — a simplified, deterministic projection for the UI kit.
   Real terms (nutidskroner). Not the real engine; just enough to make the
   levers feel live. Values returned in millions of kr for the chart. */
(function () {
  function simulate(inp, stopAge) {
    const {
      currentAge,
      lifeExpectancy,
      monthlySpend,
      savings,
      monthlySaving,
      pension,
      realReturn,
      folkepensionAge,
      folkepensionMonthly,
      pensionAccessAge
    } = inp;
    const r = realReturn / 100;
    let free = savings;
    let pen = pension;
    const data = [];
    let depletedAt = null;
    let worstGap = 0;
    for (let age = currentAge; age <= lifeExpectancy; age++) {
      const total = Math.max(0, free) + Math.max(0, pen);
      data.push({
        age,
        value: total / 1e6
      });
      free *= 1 + r;
      pen *= 1 + r;
      if (age < stopAge) {
        free += monthlySaving * 12;
      } else {
        let need = monthlySpend * 12;
        if (age >= folkepensionAge) need -= folkepensionMonthly * 12;
        need = Math.max(0, need);
        if (age >= pensionAccessAge && pen > 0) {
          const fromPen = Math.min(pen, need);
          pen -= fromPen;
          need -= fromPen;
        }
        free -= need;
        if (free < 0) {
          if (depletedAt === null) depletedAt = age;
          worstGap = Math.max(worstGap, need); // approximate monthly gap basis
        }
      }
    }
    return {
      data,
      depletedAt
    };
  }
  function project(inp) {
    // The chart uses the user's planned stop age.
    const plan = simulate(inp, inp.planAge);

    // Freedom age: earliest stop age whose money lasts to life expectancy.
    let freedomAge = null;
    for (let s = inp.currentAge + 1; s <= inp.lifeExpectancy; s++) {
      const sim = simulate(inp, s);
      if (sim.depletedAt === null) {
        freedomAge = s;
        break;
      }
    }

    // Capital at planned stop age (millions).
    const stopPoint = plan.data.find(d => d.age === inp.planAge);
    const capitalAtStop = stopPoint ? stopPoint.value : 0;

    // Monthly gap at first shortfall (rough): remaining spend not covered.
    let monthlyGap = 0;
    if (plan.depletedAt != null) {
      let need = inp.monthlySpend;
      if (plan.depletedAt >= inp.folkepensionAge) need -= inp.folkepensionMonthly;
      monthlyGap = Math.max(0, Math.round(need / 500) * 500);
    }

    // Status.
    let status;
    if (freedomAge != null && freedomAge <= inp.planAge) status = "ontrack";else if (freedomAge != null && freedomAge <= inp.planAge + 3) status = "tight";else status = "risk";
    return {
      data: plan.data,
      freedomAge,
      planAge: inp.planAge,
      lifeExpectancy: inp.lifeExpectancy,
      capitalAtStop,
      firstShortfallAge: plan.depletedAt,
      monthlyGap,
      status
    };
  }
  window.FrihedsmodelFinance = {
    project,
    simulate
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/finance.js", error: String((e && e.message) || e) }); }

// ui_kits/frihedsmodel-public/icons.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Lucide-derived inline icons (ISC licensed). Calm 2px stroke to match Public Sans UI. */
const Ic = ({
  size = 18,
  children,
  ...p
}) => /*#__PURE__*/React.createElement("svg", _extends({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, p), children);
const ArrowRight = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("line", {
  x1: "5",
  y1: "12",
  x2: "19",
  y2: "12"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "12 5 19 12 12 19"
}));
const ArrowLeft = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("line", {
  x1: "19",
  y1: "12",
  x2: "5",
  y2: "12"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "12 19 5 12 12 5"
}));
const Info = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "10"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "16",
  x2: "12",
  y2: "12"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "8",
  x2: "12.01",
  y2: "8"
}));
const Sliders = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("line", {
  x1: "4",
  y1: "21",
  x2: "4",
  y2: "14"
}), /*#__PURE__*/React.createElement("line", {
  x1: "4",
  y1: "10",
  x2: "4",
  y2: "3"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "21",
  x2: "12",
  y2: "12"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "8",
  x2: "12",
  y2: "3"
}), /*#__PURE__*/React.createElement("line", {
  x1: "20",
  y1: "21",
  x2: "20",
  y2: "16"
}), /*#__PURE__*/React.createElement("line", {
  x1: "20",
  y1: "12",
  x2: "20",
  y2: "3"
}), /*#__PURE__*/React.createElement("line", {
  x1: "1",
  y1: "14",
  x2: "7",
  y2: "14"
}), /*#__PURE__*/React.createElement("line", {
  x1: "9",
  y1: "8",
  x2: "15",
  y2: "8"
}), /*#__PURE__*/React.createElement("line", {
  x1: "17",
  y1: "16",
  x2: "23",
  y2: "16"
}));
const Check = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("polyline", {
  points: "20 6 9 17 4 12"
}));
const Alert = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
  d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "9",
  x2: "12",
  y2: "13"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "17",
  x2: "12.01",
  y2: "17"
}));
const Download = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
  d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "7 10 12 15 17 10"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "15",
  x2: "12",
  y2: "3"
}));
const Compass = p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "10"
}), /*#__PURE__*/React.createElement("polygon", {
  points: "16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
}));
Object.assign(window, {
  Ic,
  ArrowRight,
  ArrowLeft,
  Info,
  Sliders,
  Check,
  Alert,
  Download,
  Compass
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frihedsmodel-public/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.HorizonChart = __ds_scope.HorizonChart;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Lever = __ds_scope.Lever;

__ds_ns.Segmented = __ds_scope.Segmented;

})();
