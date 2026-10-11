const fs=require('fs'),path=require('path')
const sharp=require('C:/Users/0/Documents/Projects/Github/What-to-watch/node_modules/sharp')
const out=path.join(__dirname,'brand')
const cx=35,cy=29,R=27,GAP=3.4
const f=n=>+n.toFixed(2)
// meridians: pole-to-pole half-ellipse arcs; parallels: bowed arcs
let d=''
for(const s of [-0.6,-0.2,0.2,0.6]){
  const rx=f(R*Math.abs(s)),sw=s>0?1:0
  d+=`M${cx} ${cy-R-2}A${rx} ${R+2} 0 0 ${sw} ${cx} ${cy+R+2}`
}
for(const k of [-0.5,0,0.5]){
  const dy=R*k,w=Math.sqrt(R*R-dy*dy)+2
  d+=`M${f(cx-w)} ${f(cy+dy)}A${f(w)} ${f(w*0.28)} 0 0 0 ${f(cx+w)} ${f(cy+dy)}`
}
const tp="M10 45C11 52 8 57 3 60C12 61.5 21 59 28 54C20 53 13 50 10 45Z"
const sw=`<path d="${tp}"/>`
function mark({fill,grad,id='m'}){
  const defs=(grad?`<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2CF2E6"/><stop offset="1" stop-color="#0A9C95"/></linearGradient>`:'')+
  `<mask id="${id}k"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff"/><path transform="rotate(-16 ${cx} ${cy})" d="${d}" fill="none" stroke="#000" stroke-width="${GAP}"/><path d="${tp}" fill="#000" stroke="#000" stroke-width="${GAP*1.6}" stroke-linejoin="round"/></mask>`
  return `<defs>${defs}</defs><g fill="${grad?`url(#${id}g)`:fill}"><circle cx="${cx}" cy="${cy}" r="${R}" mask="url(#${id}k)"/>${sw}</g>`
}
const svg=(vb,body,extra='')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${body}</svg>\n`
const W=(n,s)=>fs.writeFileSync(path.join(out,n),s)
W('mark.svg',svg('0 0 64 64',mark({grad:1})))
W('mark-mono-white.svg',svg('0 0 64 64',mark({fill:'#fff'})))
W('mark-mono-ink.svg',svg('0 0 64 64',mark({fill:'#141414'})))
W('favicon.svg',svg('0 0 64 64',mark({grad:1})))
const txt=(x,y,size,fill,anchor)=>`<text x="${x}" y="${y}" font-family="'DM Sans',system-ui,sans-serif" font-weight="950" font-size="${size}" letter-spacing="${-0.05*size}" fill="${fill}" text-anchor="${anchor}">ScrollFlix</text>`
for(const [n,c] of [['dark','#fff'],['light','#141414']]){
  W(`logo-horizontal-${n}.svg`,svg('0 0 290 64',mark({grad:1,id:'h'})+`<g>${txt(76,45,42,c,'start')}</g>`))
  W(`logo-stacked-${n}.svg`,svg('0 0 240 130',`<g transform="translate(88 0)">${mark({grad:1,id:'s'})}</g>`+txt(120,116,40,c,'middle')))
}
;(async()=>{
  const m=fs.readFileSync(path.join(out,'mark.svg'))
  await sharp(m,{density:72*32/64*4}).resize(32,32).png().toFile(path.join(out,'favicon-32.png'))
  const mk=await sharp(m,{density:300}).resize(126,126).png().toBuffer()
  await sharp({create:{width:180,height:180,channels:3,background:'#141414'}}).composite([{input:mk,gravity:'center'}]).png().toFile(path.join(out,'apple-touch-icon.png'))
  // big preview of mark + 16px check
  const big=await sharp(m,{density:300}).resize(512,512).flatten({background:'#141414'}).png().toFile(path.join(out,'_check.png'))
  const px16=await sharp(m,{density:300}).resize(16,16).flatten({background:'#141414'}).resize(256,256,{kernel:'nearest'}).png().toFile(path.join(out,'_check16.png'))
})()
