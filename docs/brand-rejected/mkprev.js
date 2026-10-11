const fs=require('fs')
const a=['mark.svg','mark-mono-white.svg','mark-mono-ink.svg','logo-horizontal-dark.svg','logo-horizontal-light.svg','logo-stacked-dark.svg','logo-stacked-light.svg','favicon.svg','favicon-32.png','apple-touch-icon.png']
const cell=(f,bg)=>`<figure style="background:${bg}"><img src="${f}" style="height:${/stacked/.test(f)?110:/horizontal/.test(f)?56:/mono|^mark/.test(f)?72:64}px"><figcaption>${f}</figcaption></figure>`
const sec=(t,bg,fg)=>`<section style="background:${bg};color:${fg}"><h2>${t}</h2><div class="g">${a.map(f=>cell(f,bg)).join('')}</div></section>`
const sizes=[16,32,64,180]
const sz=bg=>`<div class="g">${sizes.map(s=>`<figure style="background:${bg}"><img src="mark.svg" width="${s}" height="${s}"><figcaption>${s}px</figcaption></figure>`).join('')}</div>`
fs.writeFileSync('brand/preview.html',`<!doctype html><meta charset=utf-8><title>ScrollFlix brand preview</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,900&display=swap" rel=stylesheet><style>body{margin:0;font:12px 'DM Sans',sans-serif}section{padding:28px 32px}h2{margin:0 0 16px;font-size:13px;opacity:.6;font-weight:400}.g{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end}figure{margin:0;padding:16px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}figcaption{opacity:.5;font-size:11px}</style>
${sec('On dark #0b0b0b','#0b0b0b','#fff')}${sec('On light #f7f0e1','#f7f0e1','#141414')}
<section style="background:#0b0b0b;color:#fff"><h2>Mark sizes, dark</h2>${sz('#0b0b0b')}</section><section style="background:#f7f0e1;color:#141414"><h2>Mark sizes, light</h2>${sz('#f7f0e1')}</section>`)
