// ==UserScript==
// @name         石河子大学课表导入小爱
// @namespace    https://github.com/togo0402/shzu-xiaoai-schedule
// @version      6.21
// @description  石河子大学强智课表一键导入小爱课程表
// @author       togo0402
// @match        https://jwgl.shzu.edu.cn/jsxsd/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function(){
'use strict';

// ========== 关键：iframe 里直接退出 ==========
if (window.top !== window.self) return;

// ========== 设备识别（可配置） ==========
const isMobile = (() => {
  const forced = localStorage.getItem('shzu_device_mode');
  if (forced === 'mobile') return true;
  if (forced === 'desktop') return false;
  // 高 >= 宽 → 移动端（竖屏/窄屏）；高 < 宽 → 桌面端（横屏/宽屏）
  return window.innerHeight >= window.innerWidth;
})();

const devName = isMobile ? '移动端' : '电脑端';
console.log(`[小爱课表] 设备:${devName} | 尺寸:${window.innerWidth}×${window.innerHeight} | 面积:${window.innerWidth * window.innerHeight}`);

// 手动切换接口（在 F12 控制台执行即可，刷新后生效）
window.shzuSetDevice = (mode) => {
  if (mode === 'auto') localStorage.removeItem('shzu_device_mode');
  else localStorage.setItem('shzu_device_mode', mode);
  console.log(`[小爱课表] 已设为 ${mode}，刷新页面生效`);
};

// ========== 其余代码从 v6.1 照抄 ==========
const CFG = {
  TOTAL_WEEK: 20,
  SCHOOL_NAME: '石河子大学',
  SECTIONS: [
    {section:1,startTime:'10:00',endTime:'10:45'},
    {section:2,startTime:'10:55',endTime:'11:40'},
    {section:3,startTime:'12:10',endTime:'12:55'},
    {section:4,startTime:'13:05',endTime:'13:50'},
    {section:5,startTime:'16:00',endTime:'16:45'},
    {section:6,startTime:'16:55',endTime:'17:40'},
    {section:7,startTime:'18:00',endTime:'18:45'},
    {section:8,startTime:'18:55',endTime:'19:40'},
    {section:9,startTime:'20:30',endTime:'21:15'},
    {section:10,startTime:'21:25',endTime:'22:10'}
  ]
};
const CK = 'shzu_xiaoai_cache_v5';
const SKIP = new Set(['wkxx','jxbz','tzdbh','ktmcstr','bzstr','xsks','jxlmc']);

function toast(msg, ms=2200){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:10px 22px;border-radius:8px;z-index:999999;font-size:14px;font-family:-apple-system,"PingFang SC",sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:opacity .3s';
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300)},ms);
}

const getCk = () => {try{return JSON.parse(localStorage.getItem(CK)||'{}')}catch(e){return{}}};
const setCk = d => {try{localStorage.setItem(CK,JSON.stringify(Object.assign(getCk(),d)))}catch(e){}};
const clrCk = () => {const c=getCk();delete c.presentWeek;delete c.semesterId;delete c.startMs;localStorage.setItem(CK,JSON.stringify(c))};

function findDoc(){
  if(document.getElementById('timetable'))return document;
  for(let i=0;i<frames.length;i++){
    try{const d=frames[i].document;if(d&&d.getElementById('timetable'))return d}catch(e){}
  }
  return null;
}
function getSid(doc){
  const s=doc.getElementById('xnxq01id');
  if(s&&s.value)return s.value;
  if(s){const o=s.querySelector('option[selected]');if(o&&o.value)return o.value}
  try{const m=doc.location.href.match(/[?&]xnxq01id=([\d-]+)/);if(m)return m[1]}catch(e){}
  const m2=doc.body.textContent.match(/\b(20\d{2})-(20\d{2})-([12])\b/);
  return m2?m2[0]:null;
}
function isCurSem(sid){
  const m=sid.match(/^(\d{4})-(\d{4})-([12])$/);if(!m)return false;
  const y1=+m[1],t=m[3],n=new Date(),y=n.getFullYear(),mo=n.getMonth()+1;
  return t==='1'?((y===y1&&mo>=9)||(y===y1+1&&mo<=1)):(y===y1+1&&mo>=2&&mo<=7);
}
function semDef(sid){
  const m=sid.match(/^(\d{4})-(\d{4})-([12])$/);if(!m)return null;
  const y=+m[1];return m[3]==='1'?`${y}-09-01`:`${y+1}-02-20`;
}
function getWeek(doc){
  const e=doc.getElementById('li_showWeek');
  if(e){const m=e.textContent.match(/第\s*(\d+)\s*周/);if(m)return +m[1]}
  const s=doc.getElementById('zc');
  if(s&&s.value){const v=+s.value;if(v>0)return v}
  try{const m2=doc.location.href.match(/[?&]zc=(\d+)/);if(m2)return +m2[1]}catch(e){}
  try{const m3=doc.body.textContent.match(/第\s*(\d+)\s*周/);if(m3)return +m3[1]}catch(e){}
  return null;
}
function calcStart(pw){
  const n=new Date(),u=new Date(n.getTime()+8*3600*1000),dow=u.getUTCDay(),off=dow===0?6:dow-1;
  const monUTC=Date.UTC(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate()-off,0,0,0);
  const realMon=monUTC-8*3600*1000;
  return realMon-(pw-1)*7*24*3600*1000;
}
function fmtDate(ms){
  const d=new Date(ms+8*3600*1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function pWeeks(s){
  const o=[];
  String(s).split(',').forEach(p=>{
    p=p.trim();
    if(p.includes('-')){const[a,b]=p.split('-').map(Number);for(let i=a;i<=b;i++)o.push(i)}
    else if(p)o.push(Number(p));
  });
  return [...new Set(o)].sort((a,b)=>a-b);
}
function pSecs(s){
  return [...new Set(String(s).split('-').map(x=>parseInt(x.trim(),10)).filter(n=>!isNaN(n)&&n>0))].sort((a,b)=>a-b);
}
function parseSchedule(doc){
  const t=doc.getElementById('timetable');if(!t)return null;
  const cs=[],rows=t.querySelectorAll('tr');
  for(let i=1;i<rows.length;i++){
    const cells=rows[i].querySelectorAll('td');if(cells.length<7)continue;
    for(let d=0;d<cells.length;d++){
      const day=d+1;
      cells[d].querySelectorAll('div.kbcontent').forEach(kb=>{
        const v=[];
        kb.querySelectorAll('font').forEach(f=>{
          if(SKIP.has(f.getAttribute('name')))return;
          const tx=f.textContent.replace(/\n/g,'').trim();if(!tx)return;
          v.push({title:f.getAttribute('title'),text:tx});
        });
        for(let k=0;k<v.length;k++){
          if(v[k].title!=='周次(节次)')continue;
          const m=v[k].text.match(/([\d\-,]+)\(周\)\[([\d\-]+)节\]/);if(!m)continue;
          const wk=pWeeks(m[1]),sc=pSecs(m[2]);
          if(!wk.length||!sc.length)continue;
          let name='';for(let j=k-1;j>=0;j--)if(!v[j].title){name=v[j].text;break}
          if(!name)continue;
          let teacher='';for(let j=k-1;j>=Math.max(k-5,0);j--)if(v[j].title==='教师'){teacher=v[j].text;break}
          let pos='';for(let j=k+1;j<Math.min(k+4,v.length);j++)if(v[j].title==='教室'){pos=v[j].text;break}
          cs.push({name,teacher,position:pos,day,sections:sc,weeks:wk});
        }
      });
    }
  }
  const seen=new Set(),u=[];
  for(const c of cs){
    const k=`${c.name}|${c.teacher}|${c.position}|${c.day}|${c.sections.join(',')}|${c.weeks.join(',')}`;
    if(!seen.has(k)){seen.add(k);u.push(c)}
  }
  return u;
}
async function resolveStart(doc){
  const sid=getSid(doc),c=getCk();
  if(sid&&c.semesterId&&c.semesterId!==sid)clrCk();
  let start=null;
  const pw=getWeek(doc);
  if(sid&&isCurSem(sid)&&pw){
    start=calcStart(pw);
    console.log(`[反推] 第${pw}周 → ${fmtDate(start)}`);
  }else if(sid&&c.semesterId===sid&&c.startMs){
    start=c.startMs;
  }else if(sid){
    const def=semDef(sid);
    if(confirm(`识别到学期: ${sid}\n使用开学日期: ${def}\n\n确定使用，取消手动输入`)){
      start=new Date(def+'T00:00:00+08:00').getTime();
    }else{
      const inp=prompt('请输入开学日期（YYYY-MM-DD）',def);
      if(!inp||!/^\d{4}-\d{2}-\d{2}$/.test(inp))return null;
      start=new Date(inp+'T00:00:00+08:00').getTime();
    }
  }else{
    const inp=prompt('未能识别学期，请输入现在是第几周','');
    if(!inp)return null;
    const wk=parseInt(inp,10);if(!wk||wk<1||wk>30)return null;
    start=calcStart(wk);
  }
  if(sid&&start)setCk({semesterId:sid,startMs:start,updatedAt:Date.now()});
  return start;
}
function buildLink(cs,start){
  const ts=String(Date.now());
  const d={
    isV2:true,t:ts,
    parserRes:{courseInfos:cs},
    timerRes:{totalWeek:CFG.TOTAL_WEEK,startSemester:String(start),startWithSunday:false,showWeekend:true,forenoon:4,afternoon:4,night:2,sections:CFG.SECTIONS},
    schoolName:CFG.SCHOOL_NAME,feedbackId:`shzu_${ts}`,id:`shzu_${ts}`
  };
  const pd=JSON.stringify({importData:JSON.stringify(d)});
  return 'voiceassist://aiweb/?source=widget&flag=268468224&url='+encodeURIComponent('https://i.ai.mi.com/h5/precache/ai-schedule/')+'&presetData='+encodeURIComponent(pd);
}
async function parseAll(){
  const doc=findDoc();
  if(!doc){alert('未找到课表，请进入"学生个人课表"页面');return null}
  const cs=parseSchedule(doc);
  if(!cs||!cs.length){alert('未解析到课程');return null}
  console.log(`[小爱课表] 解析到 ${cs.length} 门课程`);
  const start=await resolveStart(doc);
  if(!start)return null;
  return {courses:cs,startMs:start};
}
async function doImport(){
  const r=await parseAll();if(!r)return;
  window.location.href=buildLink(r.courses,r.startMs);
}
async function doJSON(){
  const r=await parseAll();if(!r)return;
  dl('课表_'+fmtDate(r.startMs)+'.json',JSON.stringify({schoolName:CFG.SCHOOL_NAME,startDate:fmtDate(r.startMs),startSemester:r.startMs,totalWeek:CFG.TOTAL_WEEK,sections:CFG.SECTIONS,courses:r.courses},null,2),'application/json');
}
async function doICS(){
  const r=await parseAll();if(!r)return;
  const p=n=>String(n).padStart(2,'0'),f=d=>`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SHZU//CN','CALSCALE:GREGORIAN'];
  let uid=0;
  for(const c of r.courses){
    const mn=Math.min(...c.sections),mx=Math.max(...c.sections);
    const si=CFG.SECTIONS.find(s=>s.section===mn),ei=CFG.SECTIONS.find(s=>s.section===mx);
    if(!si||!ei)continue;
    const[sh,sm]=si.startTime.split(':').map(Number),[eh,em]=ei.endTime.split(':').map(Number);
    for(const w of c.weeks){
      const base=r.startMs+((w-1)*7+(c.day-1))*24*3600*1000;
      const d=new Date(base),sd=new Date(d),ed=new Date(d);
      sd.setHours(sh,sm,0,0);ed.setHours(eh,em,0,0);
      L.push('BEGIN:VEVENT',`UID:shzu-${Date.now()}-${uid++}@shzu.edu.cn`,`DTSTAMP:${f(new Date())}`,`DTSTART:${f(sd)}`,`DTEND:${f(ed)}`,`SUMMARY:${c.name}`);
      if(c.position)L.push(`LOCATION:${c.position}`);
      if(c.teacher)L.push(`DESCRIPTION:教师: ${c.teacher}`);
      L.push('END:VEVENT');
    }
  }
  L.push('END:VCALENDAR');
  dl('课表_'+fmtDate(r.startMs)+'.ics',L.join('\r\n'),'text/calendar');
}
function dl(name,content,mime){
  const b=new Blob([content],{type:mime+';charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=name;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
async function doPreview(){
  const r=await parseAll();if(!r)return;
  document.getElementById('shzu-preview')?.remove();
  const m=document.createElement('div');
  m.id='shzu-preview';
  const sum=ws=>{
    if(!ws.length)return '-';
    const p=[];let s=ws[0],v=ws[0];
    for(let i=1;i<=ws.length;i++){
      if(i<ws.length&&ws[i]===v+1){v=ws[i];continue}
      p.push(s===v?`${s}`:`${s}-${v}`);
      if(i<ws.length){s=v=ws[i]}
    }
    return p.join(',');
  };
  m.innerHTML=`
    <div class="shzu-mask"></div>
    <div class="shzu-box">
      <div class="shzu-head"><h3>课表预览 · ${r.courses.length} 门</h3><span class="shzu-x">×</span></div>
      <div class="shzu-info">${CFG.SCHOOL_NAME} | 开学:${fmtDate(r.startMs)} | 总周数:${CFG.TOTAL_WEEK}</div>
      <div class="shzu-body"><table><thead><tr><th>课程</th><th>教师</th><th>星期</th><th>节次</th><th>周次</th><th>地点</th></tr></thead><tbody>
      ${r.courses.map(c=>`<tr><td>${c.name}</td><td>${c.teacher||'-'}</td><td>周${'一二三四五六日'[c.day-1]}</td><td>${c.sections.join(',')}</td><td>${sum(c.weeks)}</td><td>${c.position||'-'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="shzu-foot">
        <button class="shzu-b" data-a="json">导出JSON</button>
        <button class="shzu-b" data-a="ics">导出ICS</button>
        <button class="shzu-b shzu-bp" data-a="import">确认导入</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('.shzu-mask').onclick=()=>m.remove();
  m.querySelector('.shzu-x').onclick=()=>m.remove();
  m.querySelectorAll('.shzu-b').forEach(b=>{
    b.onclick=()=>{
      const a=b.dataset.a;m.remove();
      if(a==='json')doJSON();
      else if(a==='ics')doICS();
      else if(a==='import'){window.location.href=buildLink(r.courses,r.startMs)}
    };
  });
}
function injectStyles(){
  if(document.getElementById('shzu-style'))return;
  const s=document.createElement('style');
  s.id='shzu-style';
  const pv=`
    #shzu-preview{position:fixed;inset:0;z-index:100000}
    #shzu-preview .shzu-mask{position:absolute;inset:0;background:rgba(0,0,0,.5)}
    #shzu-preview .shzu-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:90vw;max-width:900px;max-height:85vh;background:#fff;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.3);font-family:-apple-system,"PingFang SC",sans-serif}
    #shzu-preview .shzu-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eee}
    #shzu-preview h3{margin:0;font-size:17px;color:#333}
    #shzu-preview .shzu-x{font-size:26px;color:#999;cursor:pointer;line-height:1}
    #shzu-preview .shzu-info{padding:10px 20px;background:#fafafa;font-size:13px;color:#666;border-bottom:1px solid #eee}
    #shzu-preview .shzu-body{flex:1;overflow:auto;padding:12px 20px}
    #shzu-preview table{width:100%;border-collapse:collapse;font-size:13px}
    #shzu-preview th,#shzu-preview td{padding:8px 10px;text-align:left;border-bottom:1px solid #f0f0f0}
    #shzu-preview th{background:#f7f7f7;font-weight:600;color:#555;position:sticky;top:0}
    #shzu-preview .shzu-foot{padding:14px 20px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end}
    #shzu-preview .shzu-b{padding:8px 18px;border:1px solid #ddd;background:#fff;border-radius:6px;font-size:14px;cursor:pointer;color:#333}
    #shzu-preview .shzu-b:hover{background:#f5f5f5}
    #shzu-preview .shzu-bp{background:#FF6B00;color:#fff;border-color:#FF6B00}
    #shzu-preview .shzu-bp:hover{background:#e85f00}
  `;
  const mob=`
    #shzu-fab{position:fixed;bottom:30px;right:30px;z-index:99999;display:flex;align-items:center;height:56px;background:linear-gradient(135deg,#FF8533,#FF6B00);color:#fff;border-radius:28px;cursor:pointer;user-select:none;box-shadow:0 4px 16px rgba(255,107,0,.4);transition:all .3s cubic-bezier(.4,0,.2,1);overflow:hidden;font-family:-apple-system,"PingFang SC",sans-serif}
    #shzu-fab.shzu-collapsed{width:56px}
    #shzu-fab.shzu-expanded{width:auto}
    #shzu-fab .shzu-icon{width:56px;height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
    #shzu-fab .shzu-label{font-size:15px;font-weight:500;white-space:nowrap;padding-right:22px;max-width:200px;transition:max-width .3s,padding .3s,opacity .3s;opacity:1}
    #shzu-fab.shzu-collapsed .shzu-label{max-width:0;padding-right:0;opacity:0}
  `;
  const dsk=`
    #shzu-fab{position:fixed;bottom:30px;right:30px;z-index:99999;font-family:-apple-system,"PingFang SC",sans-serif}
    #shzu-fab .shzu-trigger{display:flex;align-items:center;gap:8px;height:52px;padding:0 20px 0 12px;background:linear-gradient(135deg,#FF8533,#FF6B00);color:#fff;border-radius:26px;cursor:pointer;user-select:none;box-shadow:0 4px 16px rgba(255,107,0,.4);transition:all .2s;font-size:15px;font-weight:500}
    #shzu-fab .shzu-trigger:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,107,0,.5)}
    #shzu-fab .shzu-panel{position:absolute;bottom:68px;right:0;width:240px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);overflow:hidden;transform-origin:bottom right;transform:scale(.9) translateY(8px);opacity:0;pointer-events:none;transition:all .2s cubic-bezier(.4,0,.2,1)}
    #shzu-fab.open .shzu-panel{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}
    #shzu-fab .shzu-ph{padding:14px 16px;font-size:15px;font-weight:600;color:#333;background:#fafafa;border-bottom:1px solid #f0f0f0}
    #shzu-fab .shzu-pb{padding:8px}
    #shzu-fab .shzu-a{display:block;width:100%;padding:11px 14px;text-align:left;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:14px;color:#333;font-family:inherit;transition:background .15s}
    #shzu-fab .shzu-a:hover{background:#f5f5f5}
    #shzu-fab .shzu-ap{background:#FF6B00;color:#fff;margin-top:4px}
    #shzu-fab .shzu-ap:hover{background:#e85f00}
  `;
  s.textContent = pv + (isMobile ? mob : dsk);
  document.head.appendChild(s);
}
function createFab(){
  if(document.getElementById('shzu-fab'))return;
  if(isMobile)mkMobile();
  else mkDesktop();
}
function mkMobile(){
  const f=document.createElement('div');
  f.id='shzu-fab';f.className='shzu-collapsed';
  f.innerHTML=`<div class="shzu-icon"><svg viewBox="0 0 32 32" width="28" height="28"><circle cx="16" cy="16" r="14" fill="#fff"/><circle cx="11.5" cy="14" r="1.8" fill="#FF6B00"/><circle cx="20.5" cy="14" r="1.8" fill="#FF6B00"/><path d="M10.5 19.5 Q16 24 21.5 19.5" stroke="#FF6B00" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></div><span class="shzu-label">一键导入</span>`;
  document.body.appendChild(f);
  let t=null,busy=false;
  const ex=()=>{f.classList.remove('shzu-collapsed');f.classList.add('shzu-expanded');clearTimeout(t);t=setTimeout(()=>{f.classList.remove('shzu-expanded');f.classList.add('shzu-collapsed')},3000)};
  f.onclick=async e=>{
    e.stopPropagation();if(busy)return;
    if(f.classList.contains('shzu-collapsed')){ex();return}
    busy=true;try{await doImport()}finally{busy=false}
  };
}
function mkDesktop(){
  const w=document.createElement('div');
  w.id='shzu-fab';
  w.innerHTML=`<div class="shzu-panel"><div class="shzu-ph">🎓 课表导入</div><div class="shzu-pb"><button class="shzu-a" data-a="preview">👁  预览课表</button><button class="shzu-a" data-a="json">📄 导出 JSON</button><button class="shzu-a" data-a="ics">📅 导出 ICS</button><button class="shzu-a shzu-ap" data-a="import">🚀 一键导入</button></div></div><div class="shzu-trigger"><svg viewBox="0 0 32 32" width="26" height="26"><circle cx="16" cy="16" r="14" fill="#fff"/><circle cx="11.5" cy="14" r="1.8" fill="#FF6B00"/><circle cx="20.5" cy="14" r="1.8" fill="#FF6B00"/><path d="M10.5 19.5 Q16 24 21.5 19.5" stroke="#FF6B00" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg><span>小爱课表</span></div>`;
  document.body.appendChild(w);
  w.querySelector('.shzu-trigger').onclick=e=>{e.stopPropagation();w.classList.toggle('open')};
  document.addEventListener('click',e=>{if(!w.contains(e.target))w.classList.remove('open')});
  w.querySelectorAll('.shzu-a').forEach(b=>{
    b.onclick=async e=>{
      e.stopPropagation();w.classList.remove('open');
      const a=b.dataset.a;
      if(a==='preview')await doPreview();
      else if(a==='json')await doJSON();
      else if(a==='ics')await doICS();
      else if(a==='import')await doImport();
    };
  });
}

injectStyles();
let __lastMobile = isMobile;
window.addEventListener('resize', () => {
  const nowMobile = (() => {
    const forced = localStorage.getItem('shzu_device_mode');
    if (forced === 'mobile') return true;
    if (forced === 'desktop') return false;
    return window.innerHeight >= window.innerWidth;
  })();
  if (nowMobile !== __lastMobile) {
    __lastMobile = nowMobile;
    console.log('[小爱课表] 方向切换，重载 UI');
    // 移除旧按钮和旧样式
    document.getElementById('shzu-fab')?.remove();
    document.getElementById('shzu-style')?.remove();
    location.reload();  // 简单粗暴但可靠
  }
});
window.addEventListener('load',()=>setTimeout(()=>{
  createFab();
  toast(`小爱课表助手 · ${devName}`);
},1200));
})();