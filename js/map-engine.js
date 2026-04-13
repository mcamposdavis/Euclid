// ── Map engine: rendering, interaction, panel, public API ───────────────────
// Reads domains, crossEdges, demoMastery as globals from map-data.js.

const canvas=document.getElementById('cv');
const ctx=canvas.getContext('2d');
const wrap=document.getElementById('wrap');

function resize(){
  canvas.width=wrap.clientWidth*devicePixelRatio;
  canvas.height=wrap.clientHeight*devicePixelRatio;
  canvas.style.width=wrap.clientWidth+'px';
  canvas.style.height=wrap.clientHeight+'px';
  draw();
}

let tx=0,ty=0,scale=1;


// Build flat lookup
const allNodes=[];
const allEdges=[];
domains.forEach(dom=>{
  dom.nodes.forEach(n=>{
    const a=n.r===0?0:n.a*Math.PI/180;
    const frac=n.r/210;
    allNodes.push({
      ...n,
      domId:dom.id,
      domCol:dom.col,
      domLabel:dom.label.replace('\n',' '),
      wx:dom.cx + Math.cos(a)*frac*dom.rx*0.92,
      wy:dom.cy + Math.sin(a)*frac*dom.ry*0.92,
    });
  });
  dom.edges.forEach(e=>allEdges.push({...e,cross:false}));
});
crossEdges.forEach(e=>allEdges.push({...e,cross:true}));

// ── mastery Map (0-100 per node) ──
const mastery=new Map();
Object.entries(demoMastery).forEach(([id,v])=>mastery.set(id,v));


function getMastery(id){ return mastery.get(id)||0; }

// ── Fast node map + prereq/dependent links ──
const nodeMap=new Map();
allNodes.forEach(n=>nodeMap.set(n.id,n));
allNodes.forEach(n=>{n.prereqs=[];n.dependents=[];});
allEdges.forEach(e=>{
  const s=nodeMap.get(e.s),t=nodeMap.get(e.t);
  if(s&&t){t.prereqs.push(s);s.dependents.push(t);}
});

function getNode(id){ return nodeMap.get(id); }

// ── Selection & pathfinding state ──
let selected=null, hovered=null;
let criticalPath=[];
let hoverPathNodes=new Set();
let hoverPathEdgeKeys=new Set();

// Walk back always picking the deepest prereq — longest chain to root
function computeCriticalPath(node){
  const path=[node];
  let cur=node;
  while(cur.prereqs.length){
    cur=cur.prereqs.reduce((best,p)=>p.d>best.d?p:best);
    if(path.includes(cur)) break;
    path.unshift(cur);
  }
  return path;
}

// BFS from start following dependents, return path to end or null
function bfsPath(start,end){
  const parent=new Map();
  const q=[start];
  parent.set(start,null);
  while(q.length){
    const cur=q.shift();
    if(cur===end){
      const path=[];let n=end;
      while(n!==null){path.push(n);n=parent.get(n);}
      return path.reverse();
    }
    for(const nb of cur.dependents){
      if(!parent.has(nb)){parent.set(nb,cur);q.push(nb);}
    }
  }
  return null;
}

function edgeKey(a,b){return a.id+'>'+b.id;}

function updateHoverPath(){
  hoverPathNodes=new Set();
  hoverPathEdgeKeys=new Set();
  if(!selected||!hovered||selected===hovered) return;
  const path=bfsPath(selected,hovered)||bfsPath(hovered,selected);
  if(!path) return;
  for(const n of path) hoverPathNodes.add(n);
  for(let i=0;i<path.length-1;i++) hoverPathEdgeKeys.add(edgeKey(path[i],path[i+1]));
}

function selectNode(nd){
  selected=nd;
  criticalPath=nd?computeCriticalPath(nd):[];
  updateHoverPath();
  if(nd) openPanel(nd);
  else closePanel();
  draw();
}

const depthCols=['','#EF9F27','#639922','#185FA5','#534AB7','#7F77DD','#E24B4A'];
const depthLabels=['','Primary','Secondary','Undergrad','Adv. undergrad','Graduate','Research frontier'];

function hexToRgb(h){
  return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};
}
function toScreen(wx,wy){
  const cw=canvas.width/devicePixelRatio,ch=canvas.height/devicePixelRatio;
  return{x:cw/2+wx*scale+tx, y:ch/2+wy*scale+ty};
}
function toWorld(sx,sy){
  const cw=canvas.width/devicePixelRatio,ch=canvas.height/devicePixelRatio;
  return{x:(sx-cw/2-tx)/scale, y:(sy-ch/2-ty)/scale};
}

const enabledDepths=new Set([1,2,3,4,5,6]);
function nodesVisible(){ return scale>0.75; }
function globalNodeAlpha(){ return Math.max(0,Math.min(1,(scale-0.75)/0.45)); }
function nodeIsVisible(d){ return enabledDepths.has(d)&&nodesVisible(); }

// ── Draw: blobs — verbatim ──
function drawBlob(dom){
  const sc=toScreen(dom.cx,dom.cy);
  const rx=dom.rx*scale,ry=dom.ry*scale;
  const rgb=hexToRgb(dom.col);
  ctx.save();
  ctx.beginPath();
  const steps=64;
  for(let i=0;i<=steps;i++){
    const a=(i/steps)*Math.PI*2;
    const w=1+0.05*Math.sin(a*3+dom.cx*0.006)+0.025*Math.cos(a*7+dom.cy*0.009)+0.015*Math.sin(a*11);
    const x=sc.x+Math.cos(a)*rx*w;
    const y=sc.y+Math.sin(a)*ry*w;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();
  const grad=ctx.createRadialGradient(sc.x,sc.y,0,sc.x,sc.y,Math.max(rx,ry));
  grad.addColorStop(0,`rgba(${rgb.r},${rgb.g},${rgb.b},0.20)`);
  grad.addColorStop(0.5,`rgba(${rgb.r},${rgb.g},${rgb.b},0.10)`);
  grad.addColorStop(1,`rgba(${rgb.r},${rgb.g},${rgb.b},0.03)`);
  ctx.fillStyle=grad;
  ctx.fill();
  ctx.strokeStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},0.30)`;
  ctx.lineWidth=1.5;
  ctx.stroke();
  ctx.restore();
}

// ── Draw: blob labels — verbatim ──
function drawBlobLabel(dom){
  const sc=toScreen(dom.cx,dom.cy);
  const rgb=hexToRgb(dom.col);
  const a=Math.max(0,1-globalNodeAlpha()*2);
  if(a<0.02) return;
  const sz=Math.max(13,17*Math.min(scale,1.3));
  ctx.save();
  ctx.font=`500 ${sz}px sans-serif`;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},${a*0.9})`;
  dom.label.split('\n').forEach((line,i,arr)=>{
    ctx.fillText(line,sc.x,sc.y+(i-(arr.length-1)/2)*sz*1.25);
  });
  ctx.restore();
}

// ── Draw: edges — pathfinding + mastery-aware colouring ──
function drawEdges(){
  if(!nodesVisible()) return;
  const ga=globalNodeAlpha();

  // Build connected edge keys from selected node
  const connectedKeys=new Set();
  if(selected){
    selected.prereqs.forEach(p=>connectedKeys.add(edgeKey(p,selected)));
    selected.dependents.forEach(d=>connectedKeys.add(edgeKey(selected,d)));
    for(let i=0;i<criticalPath.length-1;i++)
      connectedKeys.add(edgeKey(criticalPath[i],criticalPath[i+1]));
  }

  allEdges.forEach(e=>{
    const sn=nodeMap.get(e.s),tn=nodeMap.get(e.t);
    if(!sn||!tn) return;
    if(!nodeIsVisible(sn.d)||!nodeIsVisible(tn.d)) return;
    const ss=toScreen(sn.wx,sn.wy),ts=toScreen(tn.wx,tn.wy);
    const key=edgeKey(sn,tn);
    const isHoverPath=hoverPathEdgeKeys.has(key);
    const isCritPath=selected&&connectedKeys.has(key)&&criticalPath.includes(sn)&&criticalPath.includes(tn);
    const isConnected=selected&&connectedKeys.has(key)&&!isCritPath;
    const isDimmed=selected&&!isHoverPath&&!isCritPath&&!isConnected;

    let col,lw,dash=false;
    if(isHoverPath){          col=`rgba(150,220,255,${0.9*ga})`;  lw=2.2;}
    else if(isCritPath){      col=`rgba(255,210,70,${0.9*ga})`;   lw=2.5;}
    else if(isConnected){
      col=tn===selected?`rgba(100,180,255,${0.78*ga})`:`rgba(255,165,70,${0.78*ga})`;lw=1.8;
    } else if(isDimmed){      col=`rgba(255,255,255,${0.025*ga})`;lw=0.5;}
    else if(e.cross){         col=`rgba(160,155,140,${0.22*ga})`; lw=0.6; dash=true;}
    else{                     col=`rgba(140,135,125,${0.38*ga})`; lw=1.1;}

    ctx.save();
    ctx.beginPath();
    if(dash){
      const mx=(ss.x+ts.x)/2,my=(ss.y+ts.y)/2;
      const dx=ts.x-ss.x,dy=ts.y-ss.y,len=Math.sqrt(dx*dx+dy*dy)||1;
      ctx.moveTo(ss.x,ss.y);
      ctx.quadraticCurveTo(mx-dy/len*22*scale,my+dx/len*22*scale,ts.x,ts.y);
      ctx.setLineDash([6,6]);
    } else {
      ctx.moveTo(ss.x,ss.y);ctx.lineTo(ts.x,ts.y);
    }
    ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.stroke();ctx.setLineDash([]);

    if(!isDimmed&&!dash&&lw>=1.1){
      const dx=ts.x-ss.x,dy=ts.y-ss.y,len=Math.sqrt(dx*dx+dy*dy)||1;
      const ux=dx/len,uy=dy/len;
      const ax=ts.x-ux*8,ay=ts.y-uy*8;
      ctx.beginPath();
      ctx.moveTo(ax-uy*3,ay+ux*3);ctx.lineTo(ts.x-ux*4,ts.y-uy*4);ctx.lineTo(ax+uy*3,ay-ux*3);
      ctx.strokeStyle=col;ctx.lineWidth=0.8;ctx.stroke();
    }
    ctx.restore();
  });
}

// ── Draw: nodes — pathfinding highlights + mastery fill ──
function drawNodes(){
  if(!nodesVisible()) return;
  const ga=globalNodeAlpha();
  const critSet=new Set(criticalPath);
  allNodes.forEach(nd=>{
    if(!nodeIsVisible(nd.d)) return;
    const sc=toScreen(nd.wx,nd.wy);
    const m=getMastery(nd.id);
    const isSel=nd===selected;
    const isPrereq=selected&&selected.prereqs.includes(nd);
    const isDependent=selected&&selected.dependents.includes(nd);
    const isCrit=critSet.has(nd);
    const isHoverPath=hoverPathNodes.has(nd);
    const isDimmed=selected&&!isSel&&!isPrereq&&!isDependent&&!isCrit&&!isHoverPath;
    const rgb=hexToRgb(nd.domCol);
    const drgb=hexToRgb(depthCols[nd.d]||'#888');
    const baseR=Math.max(3.5,8*Math.min(1,scale/1.8));
    const r=baseR*(1.3-nd.d*0.05)*(isSel?1.5:1);
    const nodeGa=isDimmed?ga*0.12:ga;

    ctx.save();
    ctx.beginPath();
    ctx.arc(sc.x,sc.y,r,0,Math.PI*2);

    if(isSel){
      ctx.fillStyle=`rgba(255,255,255,${0.18*ga})`;
      ctx.strokeStyle=`rgba(255,255,255,${ga})`;
      ctx.lineWidth=2;
    } else if(isHoverPath){
      ctx.fillStyle=`rgba(150,220,255,${0.25*ga})`;
      ctx.strokeStyle=`rgba(150,220,255,${0.9*ga})`;
      ctx.lineWidth=1.8;
    } else if(isCrit&&selected){
      ctx.fillStyle=`rgba(255,210,70,${0.18*ga})`;
      ctx.strokeStyle=`rgba(255,210,70,${0.85*ga})`;
      ctx.lineWidth=1.8;
    } else if(isPrereq){
      ctx.fillStyle=`rgba(100,180,255,${0.2*ga})`;
      ctx.strokeStyle=`rgba(100,180,255,${0.85*ga})`;
      ctx.lineWidth=1.8;
    } else if(isDependent){
      ctx.fillStyle=`rgba(255,165,70,${0.2*ga})`;
      ctx.strokeStyle=`rgba(255,165,70,${0.85*ga})`;
      ctx.lineWidth=1.8;
    } else if(m>=80){
      ctx.fillStyle=`rgba(29,158,117,${nodeGa})`;
      ctx.strokeStyle=`rgba(8,80,65,${nodeGa})`;
      ctx.lineWidth=2;
    } else if(m>0){
      ctx.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},${0.25*nodeGa})`;
      ctx.strokeStyle=`rgba(${drgb.r},${drgb.g},${drgb.b},${0.85*nodeGa})`;
      ctx.lineWidth=1.4;
    } else {
      ctx.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},${0.15*nodeGa})`;
      ctx.strokeStyle=`rgba(${drgb.r},${drgb.g},${drgb.b},${0.5*nodeGa})`;
      ctx.lineWidth=1;
    }
    ctx.fill();ctx.stroke();

    // Mastery arc fill for partial progress (only when not in a highlight state)
    if(m>0&&m<80&&!isSel&&!isPrereq&&!isDependent&&!isCrit&&!isHoverPath){
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sc.x,sc.y);
      ctx.arc(sc.x,sc.y,r,-Math.PI/2,-Math.PI/2+(m/100)*Math.PI*2);
      ctx.closePath();
      ctx.fillStyle=`rgba(29,158,117,${0.45*nodeGa})`;
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    const sz=Math.min(13,Math.max(8,8.5+(scale-1)*1.8));
    const labelAlpha=isDimmed?ga*0.1:ga*0.9;
    ctx.save();
    ctx.font=`${nd.d<=3?'500':'400'} ${sz}px sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillStyle=`rgba(220,217,205,${labelAlpha})`;
    nd.label.split('\n').forEach((line,i)=>{ctx.fillText(line,sc.x,sc.y+r+2+i*(sz+1));});
    ctx.restore();
  });
}

// ── Main draw — verbatim ──
function draw(){
  const cw=canvas.width/devicePixelRatio,ch=canvas.height/devicePixelRatio;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  ctx.clearRect(0,0,cw,ch);
  domains.forEach(dom=>drawBlob(dom));
  drawEdges();
  drawNodes();
  domains.forEach(dom=>drawBlobLabel(dom));
  document.getElementById('hint').style.opacity=scale>1.6?'0':'1';
}

// ── Depth filters — verbatim ──
function buildDepthFilters(){
  const el=document.getElementById('depth-filters');
  el.innerHTML='';
  for(let d=6;d>=1;d--){
    const col=depthCols[d];
    const btn=document.createElement('div');
    btn.className='df-btn'+(enabledDepths.has(d)?'':' off');
    btn.dataset.d=d;
    btn.innerHTML=`<span class="df-dot" style="background:${col}"></span>${depthLabels[d]}`;
    btn.addEventListener('click',()=>{
      if(enabledDepths.has(d)) enabledDepths.delete(d);
      else enabledDepths.add(d);
      btn.classList.toggle('off',!enabledDepths.has(d));
      draw();
    });
    el.appendChild(btn);
  }
}

// ── Pan & zoom — verbatim ──
let dragging=false,lx=0,ly=0,moved=false;
canvas.addEventListener('mousedown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;moved=false;});
window.addEventListener('mouseup',()=>dragging=false);
window.addEventListener('mousemove',e=>{
  if(dragging){
    const dx=e.clientX-lx,dy=e.clientY-ly;
    if(Math.abs(dx)+Math.abs(dy)>2) moved=true;
    tx+=dx;ty+=dy;lx=e.clientX;ly=e.clientY;draw();
  }
  if(!nodesVisible()){document.getElementById('tt').style.opacity='0';return;}
  const r=canvas.getBoundingClientRect();
  const wpos=toWorld(e.clientX-r.left,e.clientY-r.top);
  let hit=null,minD=999;
  allNodes.forEach(nd=>{
    if(!nodeIsVisible(nd.d)) return;
    const dx=nd.wx-wpos.x,dy=nd.wy-wpos.y;
    const d=Math.sqrt(dx*dx+dy*dy);
    if(d<16/scale&&d<minD){minD=d;hit=nd;}
  });
  if(hit!==hovered){
    hovered=hit;
    updateHoverPath();
    draw();
  }
  const tt=document.getElementById('tt');
  if(hit&&!selected){
    const m=getMastery(hit.id);
    tt.querySelector('.tt-t').textContent=hit.label;
    tt.querySelector('.tt-d').textContent=hit.desc;
    tt.querySelector('.tt-msc').textContent=`MSC ${hit.msc} · depth ${hit.d} · ${hit.domLabel}`;
    const pres=hit.prereqs.map(p=>p.label);
    tt.querySelector('.tt-s').textContent=pres.length?'Builds on: '+pres.slice(0,4).join(', ')+(pres.length>4?'…':''):'Entry point — no prerequisites';
    tt.style.opacity='1';
    let tx2=e.clientX-r.left+16,ty2=e.clientY-r.top-14;
    if(tx2+268>r.width) tx2=e.clientX-r.left-274;
    if(ty2<0) ty2=e.clientY-r.top+16;
    tt.style.left=tx2+'px';tt.style.top=ty2+'px';
  } else {
    tt.style.opacity='0';
  }
});

canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left,my=e.clientY-r.top;
  const cw=canvas.width/devicePixelRatio,ch=canvas.height/devicePixelRatio;
  const wx=(mx-cw/2-tx)/scale,wy=(my-ch/2-ty)/scale;
  scale=Math.max(0.25,Math.min(8,scale*(e.deltaY<0?1.1:0.91)));
  tx=mx-cw/2-wx*scale;ty=my-ch/2-wy*scale;
  draw();
},{passive:false});

// Touch — verbatim
canvas.addEventListener('touchstart',e=>{if(e.touches.length===1){dragging=true;lx=e.touches[0].clientX;ly=e.touches[0].clientY;moved=false;}},{passive:true});
canvas.addEventListener('touchend',()=>dragging=false);
canvas.addEventListener('touchmove',e=>{
  if(dragging&&e.touches.length===1){
    const dx=e.touches[0].clientX-lx,dy=e.touches[0].clientY-ly;
    if(Math.abs(dx)+Math.abs(dy)>2) moved=true;
    tx+=dx;ty+=dy;
    lx=e.touches[0].clientX;ly=e.touches[0].clientY;draw();
  }
},{passive:true});

document.getElementById('bz+').onclick=()=>{scale=Math.min(8,scale*1.3);draw();};
document.getElementById('bz-').onclick=()=>{scale=Math.max(0.25,scale/1.3);draw();};
document.getElementById('br').onclick=()=>{scale=1;tx=0;ty=0;draw();};

canvas.addEventListener('click',e=>{
  if(moved) return;
  if(!nodesVisible()) return;
  const r=canvas.getBoundingClientRect();
  const wpos=toWorld(e.clientX-r.left,e.clientY-r.top);
  let hit=null,minD=999;
  allNodes.forEach(nd=>{
    if(!nodeIsVisible(nd.d)) return;
    const dx=nd.wx-wpos.x,dy=nd.wy-wpos.y;
    const d=Math.sqrt(dx*dx+dy*dy);
    if(d<16/scale&&d<minD){minD=d;hit=nd;}
  });
  selectNode(hit===selected?null:hit);
});

window.addEventListener('keydown',e=>{if(e.key==='Escape') selectNode(null);});

// ── Progress counter ──
function updateProgress(){
  const total=allNodes.length;
  const mastered=allNodes.filter(n=>getMastery(n.id)>=80).length;
  const inProg=allNodes.filter(n=>{const m=getMastery(n.id);return m>0&&m<80;}).length;
  const pct=Math.round((mastered/total)*100);
  document.getElementById('pf').style.width=pct+'%';
  document.getElementById('pt').textContent=`${mastered} mastered · ${inProg} in progress · ${total} total`;
}

// ── Side panel ──
function openPanel(nd){
  draw();

  const col=nd.domCol;
  const tag=document.getElementById('panelTag');
  tag.textContent=nd.domLabel;
  tag.style.color=col;

  document.getElementById('panelName').innerHTML=`<em style="color:${col}">${nd.label.replace('\n',' ')}</em>`;
  document.getElementById('panelDesc').textContent=nd.desc;
  document.getElementById('panelMsc').textContent=`MSC ${nd.msc} · Depth ${nd.d}: ${depthLabels[nd.d]||''}`;

  const m=getMastery(nd.id);
  const prereqs=nd.prereqs;
  const unlocks=nd.dependents;

  const stateLabel=m>=80?'Mastered':m>0?'In progress':'Not yet studied';
  const stateCol=m>=80?'#1D9E75':m>0?'#7F77DD':'#5a5955';

  const gaps=prereqs.filter(p=>getMastery(p.id)<60);
  const gapText=gaps.length
    ? `${gaps.length} suggested prerequisite${gaps.length>1?'s':''} not yet covered: ${gaps.map(g=>g.label.replace('\n',' ')).join(', ')}.`
    : prereqs.length ? 'Good coverage of the suggested prerequisites.' : '';

  const circ=2*Math.PI*20;
  const dash=Math.round((m/100)*circ);

  let html=`<div>
    <div class="panel-section-label">Mastery</div>
    <div class="mastery-row">
      <svg width="52" height="52" viewBox="0 0 52 52" style="flex-shrink:0">
        <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4"/>
        <circle cx="26" cy="26" r="20" fill="none"
          stroke="${stateCol}" stroke-width="4"
          stroke-dasharray="${dash} ${circ}"
          stroke-dashoffset="${circ*0.25}"
          stroke-linecap="round"/>
        <text x="26" y="31" text-anchor="middle"
          font-family="monospace" font-size="11"
          fill="${stateCol}">${m}%</text>
      </svg>
      <div class="mastery-info">
        <div class="mastery-state" style="color:${stateCol}">${stateLabel}</div>
        <div class="mastery-sub">${m>=80?'Available for spaced review':'Jump in anytime — prerequisites are suggestions'}</div>
      </div>
    </div>
  </div>`;

  if(gapText){
    html+=`<div class="context-note"><strong>Context:</strong> ${gapText} You can start here regardless.</div>`;
  }

  if(criticalPath.length>1){
    const pathHtml=criticalPath.map(n=>`<span style="cursor:pointer;padding:1px 3px;border-radius:3px;${n===nd?'color:var(--text);font-weight:500':'color:var(--text2)'}" onclick="selectNode(nodeMap.get('${n.id}'))">${n.label.replace('\n',' ')}</span>`).join('<span style="color:var(--text3)"> → </span>');
    html+=`<div><div class="panel-section-label">Critical path from root</div><div style="font-size:12px;line-height:2">${pathHtml}</div></div>`;
  }

  if(prereqs.length){
    html+=`<div><div class="panel-section-label">Builds on</div><div class="rel-list">`;
    prereqs.forEach(p=>{
      const pm=getMastery(p.id);
      const cls=pm>=80?'mastered':pm>0?'partial':'none';
      const icon=pm>=80?'✓':pm>0?'~':'○';
      html+=`<div class="rel-item" onclick="selectNode(nodeMap.get('${p.id}'))">
        <div class="rel-icon ${cls}">${icon}</div>
        <span class="rel-name">${p.label.replace('\n',' ')}</span>
        <span class="rel-depth" style="color:${depthCols[p.d]}">${p.d}</span>
        <span class="rel-pct">${pm>0?pm+'%':''}</span>
      </div>`;
    });
    html+=`</div></div>`;
  }

  if(unlocks.length){
    const shown=unlocks.slice(0,8);
    const extra=unlocks.length>8?unlocks.length-8:0;
    html+=`<div><div class="panel-section-label">Leads to</div><div class="rel-list">`;
    shown.forEach(u=>{
      const um=getMastery(u.id);
      const cls=um>=80?'mastered':um>0?'partial':'none';
      const icon=um>=80?'✓':um>0?'~':'○';
      html+=`<div class="rel-item" onclick="selectNode(nodeMap.get('${u.id}'))">
        <div class="rel-icon ${cls}">${icon}</div>
        <span class="rel-name">${u.label.replace('\n',' ')}</span>
        <span class="rel-depth" style="color:${depthCols[u.d]}">${u.d}</span>
        <span class="rel-pct">${um>0?um+'%':''}</span>
      </div>`;
    });
    if(extra) html+=`<div style="font-size:11px;color:var(--text3);padding:4px 10px">+${extra} more</div>`;
    html+=`</div></div>`;
  }

  document.getElementById('panelBody').innerHTML=html;

  const goBtn=document.getElementById('panelGoBtn');
  goBtn.textContent=m>=80?'Review →':'Go to lesson →';

  document.getElementById('panel').classList.add('open');
  setTimeout(()=>{ resize(); },260);
}

function closePanel(){
  selected=null;
  criticalPath=[];
  hoverPathNodes=new Set();
  hoverPathEdgeKeys=new Set();
  document.getElementById('panel').classList.remove('open');
  draw();
  setTimeout(()=>{ resize(); },260);
}

// ── Toast (called from learning platform on lesson completion) ──
function showToast(title,sub){
  document.getElementById('toastTitle').textContent=title;
  document.getElementById('toastSub').textContent=sub;
  const t=document.getElementById('toast');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),4500);
}
function hideToast(){ document.getElementById('toast').classList.remove('show'); }

// ── Public API — called by lesson engine ──
// e.g. window.euclidMap.setMastery('calc1', 75)
window.euclidMap={
  setMastery(id,val){
    mastery.set(id,Math.max(0,Math.min(100,val)));
    updateProgress();
    draw();
    if(selected&&selected.id===id) openPanel(selected);
  },
  getMastery,
  showToast,
};

window.addEventListener('resize',resize);
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',draw);
buildDepthFilters();
updateProgress();
resize();

