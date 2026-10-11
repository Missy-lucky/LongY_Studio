/** 生成占位缩略图（演示用，接真实 Provider 后由生成结果替换） */
export function placeholderThumb(seed: string, label: string, hue: number): string {
  const h = (hue * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h},42%,26%)"/>
      <stop offset="1" stop-color="hsl(${(h + 40) % 360},38%,16%)"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#g)"/>
  <rect x="8" y="8" width="224" height="284" fill="none" stroke="rgba(255,255,255,.14)" stroke-dasharray="6 5" rx="10"/>
  <text x="120" y="150" font-family="Microsoft YaHei,sans-serif" font-size="17" fill="rgba(248,250,252,.85)" text-anchor="middle">${label}</text>
  <text x="120" y="176" font-family="Consolas,monospace" font-size="10" fill="rgba(166,180,200,.6)" text-anchor="middle">${seed}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
