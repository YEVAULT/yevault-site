function qClass(q){
  if(!q) return 'q-na';
  const value=q.toLowerCase();
  if(value.includes('high')) return 'q-high';
  if(value.includes('cd')) return 'q-cd';
  if(value.includes('low')) return 'q-low';
  if(value.includes('record')) return 'q-rec';
  if(value.includes('confirm')) return 'q-conf';
  if(value.includes('not avail')||value.includes('unavail')) return 'q-na';
  return 'q-other';
}

function escapeHTML(value=''){
  return String(value).replace(/[&<>"]/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  })[char]);
}

let allData=null;
let currentTab='u';
let currentLabel='songs';
let searchTimer;
let activePeriod='all';

function loadData(){
  const bytes=Uint8Array.from(atob(RAW),char=>char.charCodeAt(0));
  allData=JSON.parse(new TextDecoder("utf-8").decode(bytes));
}

document.addEventListener('keydown',event=>{
  const search=document.getElementById('search-box');
  if(event.key==='/' && document.activeElement!==search){
    event.preventDefault();
    search.focus();
  }
  if(event.key==='Escape' && document.activeElement===search){
    search.blur();
  }
});

window.addEventListener('scroll',()=>{
  const button=document.getElementById('scroll-top');
  button.classList.toggle('visible',window.scrollY>500);
},{passive:true});

function goToTop(){
  window.scrollTo({top:0,behavior:'smooth'});
}

function dismissShopNotice(){
  document.getElementById('shop-popup')?.classList.add('hidden');
}

function switchTab(key,label){
  if(key===currentTab) return;

  currentTab=key;
  currentLabel=label;
  document.getElementById('album-preview-link').hidden=key!=='a';

  document.querySelectorAll('.nav-tab').forEach(button=>{
    button.classList.toggle('active',button.dataset.tab===key);
    button.setAttribute('aria-pressed',String(button.dataset.tab===key));
  });

  const search=document.getElementById('search-box');
  search.value='';

  const list=document.getElementById('era-list');
  list.classList.remove('switching');
  void list.offsetWidth;
  list.classList.add('switching');

  refreshArchive();
  list.addEventListener('animationend',()=>list.classList.remove('switching'),{once:true});
}

function renderEras(eraObj,filter=''){
  const list=document.getElementById('era-list');
  const keys=Object.keys(eraObj);
  const total=keys.reduce((sum,key)=>sum+eraObj[key].length,0);
  document.getElementById('total-eras').textContent=keys.length;
  document.getElementById('total-entries').textContent=total.toLocaleString();
  for(const key of ['u','r','a']) document.getElementById('count-'+key).textContent=Object.values(allData[key]).reduce((sum,items)=>sum+items.length,0).toLocaleString();





  let filtered=eraObj;
  const term=filter.trim().toLowerCase();

  filtered={};
  const linkedOnly=document.getElementById('linked-only').checked;
  Object.entries(eraObj).forEach(([era,songs])=>{
    const year=Number((ERA_META[era]?.years||'').match(/\d{4}/)?.[0]||2020);
    if(activePeriod!=='all' && Math.floor(year/10)*10!==Number(activePeriod)) return;
    let matched=linkedOnly?songs.filter(song=>Boolean(song[3])):songs;
    if(term && !era.toLowerCase().includes(term)) matched=matched.filter(([name])=>name.toLowerCase().includes(term));
    if(matched.length) filtered[era]=matched;
  });
  const visibleCount=Object.values(filtered).reduce((sum,items)=>sum+items.length,0);
  document.getElementById('result-count').textContent=Object.keys(filtered).length+' eras / '+visibleCount.toLocaleString()+' entries';

  list.innerHTML='';

  if(!Object.keys(filtered).length){
    list.innerHTML='<div class="no-results">No matching entries</div>';
    return;
  }

  Object.entries(filtered).forEach(([era,songs])=>{
    const wrap=document.createElement('section');
    wrap.className='era-wrap';

    const row=document.createElement('div');
    row.className='era-row';
    row.setAttribute('role','button');
    row.setAttribute('tabindex','0');
    row.setAttribute('aria-expanded','false');
    const meta=ERA_META[era]||{};
    row.innerHTML=`
      <div class="era-description"><span class="era-code">${String(keys.indexOf(era)+1).padStart(2,'0')}</span><div class="era-row-name">${escapeHTML(era)}</div></div>
      <div class="era-years">${escapeHTML(meta.years||'—')}</div><span class="era-pill">${songs.length.toLocaleString()}</span><span class="era-toggle" aria-hidden="true">+</span>`;

    const panel=document.createElement('div');
    panel.className='songs-panel';

    const inner=document.createElement('div');
    inner.className='songs-inner';

    const toggleEra=()=>{
      const isOpen=panel.classList.contains('open');

      document.querySelectorAll('.songs-panel.open').forEach(openPanel=>{
        if(openPanel===panel) return;
        openPanel.classList.remove('open');
        const openRow=openPanel.closest('.era-wrap').querySelector('.era-row');
        openRow.classList.remove('active');
        openRow.setAttribute('aria-expanded','false');
        openRow.querySelector('.era-toggle').textContent='+';
      });

      panel.classList.toggle('open',!isOpen);
      row.classList.toggle('active',!isOpen);
      row.setAttribute('aria-expanded',String(!isOpen));
      row.querySelector('.era-toggle').textContent=isOpen?'+':'−';

      if(!isOpen && !inner.dataset.loaded){
        inner.dataset.loaded='1';
        renderSongs(inner,songs);
      }
    };

    row.addEventListener('click',toggleEra);
    row.addEventListener('keydown',event=>{
      if(event.key==='Enter' || event.key===' '){
        event.preventDefault();
        toggleEra();
      }
    });

    panel.appendChild(inner);
    wrap.append(row,panel);
    list.appendChild(wrap);
  });
}

function renderSongs(inner,songs){
  inner.innerHTML='<div class="song-head" aria-hidden="true"><span class="song-num"></span><span>TITLE</span><span>'+(currentTab==='r'?'TYPE':'QUALITY')+'</span><span>LENGTH</span><span></span><span></span></div>';
  songs.forEach(([name,quality,length,url,notes],index)=>{
    const hasNote=Boolean(notes && notes.trim());
    const item=document.createElement('div');
    item.className='song-item'+(url?'':' no-link')+(hasNote?' has-note':'');

    item.innerHTML=`
      <div class="song-num">${String(index+1).padStart(2,'0')}</div>
      <div class="song-name" title="${escapeHTML(name)}">${escapeHTML(name)}</div>
      ${quality?`<div class="song-quality ${qClass(quality)}">${escapeHTML(quality)}</div>`:'<div></div>'}
      <div class="song-len">${escapeHTML(length||'')}</div>
      ${url?`<a class="song-open" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(name)}"><svg class="external-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a>`:'<span></span>'}
      ${hasNote?'<button class="note-toggle" type="button" aria-label="Show note">+</button>':'<div></div>'}`;

    if(url){
      item.style.cursor='pointer';
      item.addEventListener('click',event=>{
        if(event.target.closest('.note-toggle, a')) return;
        window.open(url,'_blank','noopener,noreferrer');
      });
    }

    inner.appendChild(item);

    if(hasNote){
      const note=document.createElement('div');
      note.className='song-note';
      note.textContent=notes;
      inner.appendChild(note);

      item.querySelector('.note-toggle').addEventListener('click',event=>{
        event.stopPropagation();
        const expanded=item.classList.toggle('expanded');
        event.currentTarget.textContent=expanded?'−':'+';
        event.currentTarget.setAttribute('aria-label',expanded?'Hide note':'Show note');
      });
    }
  });
}

function onSearch(value){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(refreshArchive,100);
}

function refreshArchive(){renderEras(allData[currentTab],document.getElementById('search-box').value);}
function setPeriod(period){
  activePeriod=period;
  document.querySelectorAll('.period-filter').forEach(button=>{const active=button.dataset.period===period;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  refreshArchive();
}
loadData();
refreshArchive();
