/* Placeholder avatars and photo thumbnails — deterministic muted palettes. */

const PHOTO_PALETTES = [
  ["#c8d3c2", "#9aab92", "#5d6e58"],
  ["#d6cdb8", "#a89876", "#6e5d3f"],
  ["#b8c5d3", "#7d92a8", "#3f526b"],
  ["#d3c2c8", "#a87d92", "#6b3f52"],
  ["#cccfc2", "#929a7d", "#5d6440"],
  ["#bfc7c2", "#8a9690", "#475e54"],
  ["#cebab1", "#a08374", "#62473b"],
  ["#b6c2bc", "#7e8e88", "#3e524c"],
  ["#d8d2c2", "#a89c7e", "#5e5235"],
  ["#bccdc7", "#82a097", "#3d6258"],
  ["#cebfb2", "#9d8674", "#5d4736"],
  ["#c5cdb4", "#959e7c", "#525a38"],
  ["#b1b9c3", "#727b8a", "#363f4d"],
  ["#cfc6c1", "#9b8a84", "#5b4843"],
  ["#bdc8b5", "#8a9a7e", "#445239"],
  ["#cab9c8", "#937e96", "#4f3d54"],
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function PhotoThumb({ seed = "x", style }) {
  const h = hash(String(seed));
  const p = PHOTO_PALETTES[h % PHOTO_PALETTES.length];
  const angle = (h % 360);
  const horizon = 35 + (h % 50);
  const variant = h % 4;
  let bg;
  if (variant === 0) {
    bg = `linear-gradient(${angle}deg, ${p[0]} 0%, ${p[1]} 60%, ${p[2]} 100%)`;
  } else if (variant === 1) {
    bg = `linear-gradient(180deg, ${p[0]} 0%, ${p[0]} ${horizon}%, ${p[1]} ${horizon}%, ${p[2]} 100%)`;
  } else if (variant === 2) {
    bg = `radial-gradient(circle at ${30 + (h % 40)}% ${30 + ((h >> 3) % 40)}%, ${p[0]} 0%, ${p[1]} 40%, ${p[2]} 100%)`;
  } else {
    bg = `linear-gradient(${angle}deg, ${p[2]} 0%, ${p[1]} 50%, ${p[0]} 100%)`;
  }
  return (
    <div className="thumb" style={{ background: bg, ...(style || {}) }} />
  );
}

function Avatar({ seed = "u", size = 34, style }) {
  const h = hash("av-" + seed);
  const p = PHOTO_PALETTES[h % PHOTO_PALETTES.length];
  const initials = String(seed).slice(0, 1).toUpperCase();
  const bg = `linear-gradient(135deg, ${p[1]} 0%, ${p[2]} 100%)`;
  return (
    <div
      className="avatar"
      style={{
        width: size, height: size,
        background: bg,
        color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 600,
        fontSize: Math.round(size * 0.42),
        letterSpacing: "-0.02em",
        ...(style || {})
      }}
    >
      {initials}
    </div>
  );
}

Object.assign(window, { PhotoThumb, Avatar });
