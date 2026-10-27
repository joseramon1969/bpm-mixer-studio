import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { detectTempo } from '../lib/tempo'
import { AudioLines, Headphones, Upload, Play, Pause, SkipBack, Disc3, SlidersHorizontal, ShieldCheck, Plus, Volume2, Radio, Zap, Music2, X, HelpCircle } from 'lucide-react'
export const Route = createFileRoute('/')({ component: Studio })
type Track = { name: string; url?: string; bpm?: number; duration?: number; wave?: number[] }
type Engine = { audio: HTMLAudioElement; gain: GainNode; eq: BiquadFilterNode[]; filter: BiquadFilterNode; analyser: AnalyserNode }
const EQ_BANDS = [
 { frequency: 60, label: '60', name: 'Subgraves' },
 { frequency: 250, label: '250', name: 'Graves' },
 { frequency: 1000, label: '1k', name: 'Medios' },
 { frequency: 2500, label: '2.5k', name: 'Presencia' },
 { frequency: 6000, label: '6k', name: 'Agudos' },
 { frequency: 12000, label: '12k', name: 'Aire' },
]
const EQ_PRESETS = [
 { name: 'Plano', gains: [0, 0, 0, 0, 0, 0] },
 { name: 'Graves', gains: [6, 4, -2, -1, 0, 0] },
 { name: 'Voz', gains: [-4, -2, 3, 4, 1, -2] },
 { name: 'Brillo', gains: [-2, -1, 0, 2, 4, 5] },
]
const eventTime = () => performance.now()
const noiseSample = () => Math.random()*2-1
const clock = (v: number) => `${Math.floor(v / 60).toString().padStart(2,'0')}:${Math.floor(v % 60).toString().padStart(2,'0')}`
export function Studio() {
 const ctx = useRef<AudioContext | null>(null), engines = useRef<(Engine | null)[]>([null,null]);
 const [lists,setLists]=useState<Track[][]>([[],[]]), [selected,setSelected]=useState([0,0]), [playing,setPlaying]=useState([false,false]), [times,setTimes]=useState([0,0]), [rates,setRates]=useState([1,1]), [cross,setCross]=useState(50), [master,setMaster]=useState(80), [message,setMessage]=useState('Todo listo. Tu próxima mezcla empieza aquí.'), [help,setHelp]=useState(false), [auto,setAuto]=useState(true), [cues,setCues]=useState<(number|null)[][]>([[null,null,null,null],[null,null,null,null]]), [loops,setLoops]=useState<(number|null)[]>([null,null]), [eq,setEq]=useState([EQ_BANDS.map(()=>0),EQ_BANDS.map(()=>0)]), [filters,setFilters]=useState([50,50]), [tab,setTab]=useState('Efectos'), [custom,setCustom]=useState<Track[]>([]);
 const eqBeforeKill=useRef([EQ_BANDS.map(()=>0),EQ_BANDS.map(()=>0)]);
 const loopStarts=useRef([0,0]), spectrum=useRef<HTMLCanvasElement>(null), fade=useRef<ReturnType<typeof setInterval>|null>(null);
 const fadeRun=useRef(0), mixing=useRef(false);
 const checkAutomix=useRef<(endedDeck?: number) => void>(()=>{});
 const replace = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, i:number,v:NoInfer<T>) => setter(old=>old.map((x,j)=>j===i?v:x));
 useEffect(()=>{try { const saved=localStorage.getItem('bpm-playlists'); if(saved){
   const parsed:unknown=JSON.parse(saved);
   if(Array.isArray(parsed)&&parsed.length===2&&parsed.every(list=>Array.isArray(list)&&list.every(track=>track&&typeof track==='object'&&typeof track.name==='string'))){
    // Restore browser metadata after hydration; the server cannot read localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLists(parsed.map((list:Track[])=>list.map(track=>({name:track.name,bpm:Number.isFinite(track.bpm)&&track.bpm!>0?track.bpm:undefined,duration:Number.isFinite(track.duration)&&track.duration!>0?track.duration:undefined}))));
   }
  } }catch{ /* Ignore unavailable or malformed browser metadata. */ }; const activeEngines=engines.current,runCounter=fadeRun; return ()=>{runCounter.current++;if(fade.current)clearInterval(fade.current); activeEngines.forEach(e=>e?.audio.pause())}},[]);
 useEffect(()=>{try{localStorage.setItem('bpm-playlists',JSON.stringify(lists.map(l=>l.map(({name,bpm,duration})=>({name,bpm,duration})))))}catch{ /* Private browsing or a full quota must not stop playback. */ }},[lists]);
 function context(){if(!ctx.current)ctx.current=new AudioContext(); void ctx.current.resume();return ctx.current}
 function updateEq(i:number,values:number[]){
  replace(setEq,i,values);
  const e=engines.current[i],c=ctx.current;
  if(e&&c)e.eq.forEach((band,j)=>{band.gain.cancelScheduledValues(c.currentTime);band.gain.setTargetAtTime(values[j],c.currentTime,.02)});
 }
 function toggleEqKill(i:number,j:number){
  const value=eq[i][j];
  if(value!==-40)eqBeforeKill.current[i][j]=value;
  updateEq(i,eq[i].map((gain,k)=>k===j?(value===-40?eqBeforeKill.current[i][j]:-40):gain));
 }
 function engine(i:number){if(engines.current[i])return engines.current[i]!;const c=context(),audio=new Audio(),source=c.createMediaElementSource(audio),gain=c.createGain(),analyser=c.createAnalyser();analyser.fftSize=256; const bands=EQ_BANDS.map((band,j)=>{const b=c.createBiquadFilter();b.type=j===0?'lowshelf':j===EQ_BANDS.length-1?'highshelf':'peaking';b.frequency.value=band.frequency;b.Q.value=1;b.gain.value=eq[i][j];return b}); const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=20000;source.connect(bands[0]);bands.forEach((band,j)=>band.connect(bands[j+1]||filter));filter.connect(gain);gain.connect(analyser);analyser.connect(c.destination);audio.preservesPitch=true;audio.ontimeupdate=()=>checkAutomix.current();audio.onended=()=>{replace(setPlaying,i,false);checkAutomix.current(i)};const e={audio,gain,eq:bands,filter,analyser};engines.current[i]=e;gain.gain.value=(master/100)*(i===0?Math.cos(cross/100*Math.PI/2):Math.sin(cross/100*Math.PI/2));return e}
 useEffect(()=>{engines.current.forEach((e,i)=>{if(e)e.gain.gain.value=master/100*(i===0?Math.cos(cross/100*Math.PI/2):Math.sin(cross/100*Math.PI/2))})},[cross,master]);
 useEffect(()=>{const timer=setInterval(()=>{checkAutomix.current();setTimes(engines.current.map((e,i)=>{if(e&&loops[i]&&e.audio.currentTime>=loopStarts.current[i]+loops[i]!*60/(lists[i][selected[i]]?.bpm||120))e.audio.currentTime=loopStarts.current[i];return e?.audio.currentTime||0}));const canvas=spectrum.current,c=canvas?.getContext('2d');if(c&&canvas){c.clearRect(0,0,canvas.width,canvas.height);const data=new Uint8Array(128);engines.current.find(e=>e&&!e.audio.paused)?.analyser.getByteFrequencyData(data);for(let x=0;x<48;x++){const h=Math.max(3,data[x]*.26);c.fillStyle=x>35?'#ff98a3':x>23?'#ffffff':'#8dbfff';c.fillRect(x*5,70-h,3,h)}}},60);return()=>clearInterval(timer)},[loops,lists,selected]);
 async function addFiles(files: FileList|null,i:number){
  const pending=Array.from(files||[]);
  if(!pending.length)return;
  let loaded=0,uncertain=0;
  const failed:string[]=[];
  for(const file of pending){
   setMessage(`Cargando ${file.name}… (${loaded+failed.length+1}/${pending.length})`);
   try{
    const buffer=await context().decodeAudioData(await file.arrayBuffer());
    const track:Track={name:file.name.replace(/\.[^.]+$/,''),url:URL.createObjectURL(file),duration:buffer.duration};
    // Publish each playable file before optional analysis, preserving restored list positions.
    setLists(old=>old.map((list,j)=>{
     if(j!==i)return list;
     const existing=list.findIndex(t=>t.name===track.name);
     return existing<0?[...list,track]:list.map((t,n)=>n===existing?track:t);
    }));
    loaded++;
    setMessage(`${file.name} lista. Analizando BPM…`);
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    let bpm:number|undefined,wave:number[]|undefined;
    try{
     const samples=buffer.getChannelData(0);
     wave=Array.from({length:160},(_,n)=>{
      let sum=0;
      const start=Math.floor(n*samples.length/160),end=Math.floor((n+1)*samples.length/160);
      for(let p=start;p<end;p+=50)sum+=Math.abs(samples[p]);
      return sum/Math.max(1,(end-start)/50);
     });
     bpm=detectTempo(buffer);
    }catch{ /* Analysis must never prevent local playback. */ }
    if(!bpm)uncertain++;
    setLists(old=>old.map((list,j)=>j===i?list.map(t=>t.url===track.url?{...t,bpm,wave}:t):list));
   }catch{failed.push(file.name)}
  }
  setMessage(`${loaded} canción(es) listas.${uncertain?` ${uncertain} sin BPM detectado; puedes reproducirlas.`:''}${failed.length?` No se pudo leer: ${failed.join(', ')}. Prueba MP3, WAV u OGG.`:''}`);
 }
 function pickFiles(event:React.ChangeEvent<HTMLInputElement>,i:number){
  void addFiles(event.currentTarget.files,i);
  event.currentTarget.value='';
 }

 function load(i:number,n:number){const t=lists[i][n];if(!t?.url){setMessage('Vuelve a agregar este archivo para reproducirlo. Los archivos no se guardan ni se suben.');return}stopAutomix(false);const e=engine(i);e.audio.pause();e.audio.src=t.url;e.audio.playbackRate=1;replace(setSelected,i,n);replace(setPlaying,i,false);replace(setRates,i,1);replace(setLoops,i,null);replace(setCues,i,[null,null,null,null]);}
 async function toggle(i:number){const t=lists[i][selected[i]];if(!t?.url){setMessage('Agrega una canción al deck para empezar.');return}const e=engine(i);if(!e.audio.src)e.audio.src=t.url;try{if(e.audio.paused){stopAutomix(false);context();await e.audio.play();replace(setPlaying,i,true)}else{stopAutomix();e.audio.pause();replace(setPlaying,i,false)}}catch{setMessage('No se pudo reproducir este archivo. Prueba otro formato.')}}
 function sync(i:number){const a=lists[i][selected[i]],b=lists[1-i][selected[1-i]];if(!a?.bpm||!b?.bpm){setMessage('Carga una canción con BPM en cada deck para sincronizar.');return}const rate=b.bpm*rates[1-i]/a.bpm;replace(setRates,i,rate);const e=engine(i);e.audio.playbackRate=rate;const other=engines.current[1-i];if(other){const beat=60/a.bpm;e.audio.currentTime=Math.min(a.duration||0,Math.floor(e.audio.currentTime/beat)*beat+(other.audio.currentTime%(60/b.bpm))*b.bpm/a.bpm)}setMessage('Tempos igualados y fase de golpes alineada. Ajusta el cue si hace falta.')}
 function stopAutomix(disable=true){
  fadeRun.current++;
  if(fade.current)clearInterval(fade.current);
  fade.current=null;
  mixing.current=false;
  if(disable)setAuto(false);
 }
 async function automate(continuing=false,endedOrActiveDeck?:number){
  if(auto&&!continuing){stopAutomix();setMessage('AUTO MIX desactivado. Puedes continuar la mezcla manualmente.');return}
  if(mixing.current)return;
  if(!lists[0][selected[0]]?.url||!lists[1][selected[1]]?.url){stopAutomix();setMessage('Carga ambos decks para usar el fundido automático.');return}
  const active=engines.current.map(e=>Boolean(e&&!e.audio.paused&&!e.audio.ended));
  const outgoing=endedOrActiveDeck??(active[0]!==active[1]?(active[0]?0:1):(cross<=50?0:1));
  const incoming=1-outgoing, target=incoming===1?100:0;
  const run=++fadeRun.current;
  setAuto(true);
  mixing.current=true;
  try{
   const source=engine(outgoing), destination=engine(incoming);
   const sourceEnded=continuing&&source.audio.ended;
   for(const i of [outgoing,incoming]){
    const audio=engine(i).audio, track=lists[i][selected[i]];
    if(audio.src!==track.url){audio.src=track.url!;audio.playbackRate=rates[i]}
    if(audio.ended&&!(i===outgoing&&sourceEnded))audio.currentTime=0;
   }
   // Keep the incoming deck silent while its playback is being prepared.
   const start=active[0]&&active[1]?cross:(outgoing===0?0:100);
   setCross(start);
   const a=lists[incoming][selected[incoming]], b=lists[outgoing][selected[outgoing]];
   if(a.bpm&&b.bpm){
    const rate=Math.max(.75,Math.min(1.25,b.bpm*source.audio.playbackRate/a.bpm));
    destination.audio.playbackRate=rate;
    replace(setRates,incoming,rate);
   }
   replace(setLoops,incoming,null);
   context();
   await Promise.all([sourceEnded?Promise.resolve():source.audio.play(),destination.audio.play()]);
   if(run!==fadeRun.current)return;
   setPlaying(engines.current.map(e=>Boolean(e&&!e.audio.paused&&!e.audio.ended)));
   setMessage(`Mezclando automáticamente hacia el deck ${incoming===0?'A':'B'}…`);
   const remaining=(source.audio.duration-source.audio.currentTime)/source.audio.playbackRate;
   const fadeDuration=source.audio.ended?1:Number.isFinite(remaining)?Math.max(1,Math.min(8000,remaining*1000)):8000;
   const started=eventTime();
   fade.current=setInterval(()=>{
    if(run!==fadeRun.current)return;
    const progress=Math.min(1,(eventTime()-started)/fadeDuration);
    setCross(start+(target-start)*progress);
    if(progress===1){
     source.audio.pause();
     replace(setPlaying,outgoing,false);
     if(fade.current)clearInterval(fade.current);
     fade.current=null;
     // Prepare the next local track on the silent deck for the return transition.
     const playlist=lists[outgoing];
     let next=selected[outgoing];
     for(let offset=1;offset<=playlist.length;offset++){
      const candidate=(selected[outgoing]+offset)%playlist.length;
      if(playlist[candidate].url){next=candidate;break}
     }
     source.audio.src=playlist[next].url!;
     source.audio.currentTime=0;
     source.audio.playbackRate=1;
     replace(setSelected,outgoing,next);
     replace(setRates,outgoing,1);
     replace(setLoops,outgoing,null);
     replace(setCues,outgoing,[null,null,null,null]);
     mixing.current=false;
     setMessage(`Mezcla completada. Deck ${incoming===0?'A':'B'} en reproducción. AUTO MIX sigue activo para el próximo cambio.`);
    }
   },40);
  }catch{
   if(run!==fadeRun.current)return;
   stopAutomix();
   setPlaying(engines.current.map(e=>Boolean(e&&!e.audio.paused&&!e.audio.ended)));
   setMessage('No se pudo iniciar la mezcla. Comprueba que ambos archivos se pueden reproducir y vuelve a intentarlo.');
  }
 }
 useEffect(()=>{checkAutomix.current=(endedDeck)=>{
  if(!auto||mixing.current)return;
  const i=endedDeck??engines.current.findIndex(e=>Boolean(e&&!e.audio.paused&&!e.audio.ended));
  if(i<0||loops[i])return;
  const audio=engines.current[i]!.audio;
  const duration=Number.isFinite(audio.duration)?audio.duration:lists[i][selected[i]]?.duration;
  if(endedDeck!==undefined||(duration&&(duration-audio.currentTime)/audio.playbackRate<=8))void automate(true,i);
 };});
 function effect(n:number){const c=context();if(n>=6){const t=custom[n-6];if(t?.url){const audio=new Audio(t.url);audio.volume=master/100;void audio.play()}return}const gain=c.createGain();gain.gain.setValueAtTime(.18*master/100,c.currentTime);gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+1.5);gain.connect(c.destination);if(n===2||n===4){const b=c.createBuffer(1,c.sampleRate,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=noiseSample()*(n===2?Math.pow(1-i/d.length,3):1);const source=c.createBufferSource();source.buffer=b;source.connect(gain);source.start()}else{const o=c.createOscillator();o.type=n===1?'sawtooth':'sine';o.frequency.setValueAtTime([600,180,300,880,200,110][n],c.currentTime);o.frequency.exponentialRampToValueAtTime(n===0?1400:70,c.currentTime+1.4);o.connect(gain);o.start();o.stop(c.currentTime+1.5)}}
 const deck=(i:number)=>{const t=lists[i][selected[i]],label=i===0?'A':'B';return <section className={`deck deck-${label}`}><div className="deck-heading"><div><span className="deck-letter">{label}</span><h2>DECK {label}</h2><span className="deck-status">{playing[i]?'REPRODUCIENDO':'EN ESPERA'}</span></div><Headphones size={17}/></div><div className="track-title"><Music2 size={18}/><div><h3>{t?.name||'Tu siguiente gran mezcla'}</h3><p>{t?'Archivo local · Listo para mezclar':'Carga una canción para comenzar'}</p></div><span className="file-type">{t?'LOCAL':'—'}</span></div><div className="wave" onClick={e=>{const audio=engines.current[i]?.audio;if(audio&&t?.duration)audio.currentTime=(e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.clientWidth*t.duration}} title="Haz clic para buscar en la canción"><div className="wave-bars">{Array.from({length:110},(_,n)=><span key={n} style={{height:`${t?.wave?Math.max(3,(t.wave[Math.floor(n*160/110)]||0)*240):5+Math.abs(Math.sin(n*1.7)*Math.cos(n*.29))*52}%`,opacity:t?.wave?1:.35}}/>)}</div><div className="playhead" style={{left:`${t?.duration?times[i]/t.duration*100:50}%`}}/><span className="wave-label">{t?'FORMA DE ONDA':'ESPERANDO AUDIO'}</span></div><div className="readouts"><div><small>TIEMPO</small><strong>{clock(times[i])}<em> / {clock(t?.duration||0)}</em></strong></div><div className="bpm"><small>BPM <span>EST.</span></small><strong>{t?.bpm?(t.bpm*rates[i]).toFixed(1):'— —'}<span> BPM</span></strong></div></div><div className="transport"><button title="Volver al inicio" onClick={()=>{const e=engines.current[i];if(e)e.audio.currentTime=0}}><SkipBack size={17}/></button><button className="cue-button" onClick={()=>{stopAutomix();const e=engines.current[i];if(e){e.audio.pause();e.audio.currentTime=cues[i][0]||0;replace(setPlaying,i,false)}}}>CUE</button><button className="play-button" aria-label={`Reproducir o pausar deck ${label}`} onClick={()=>void toggle(i)}>{playing[i]?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</button><button className="sync-button" onClick={()=>sync(i)}>↔ SYNC</button></div><div className="tempo-row"><span>TEMPO</span><input aria-label={`Tempo deck ${label}`} type="range" min="0.75" max="1.25" step="0.001" value={rates[i]} onChange={e=>{const v=+e.target.value;replace(setRates,i,v);if(engines.current[i])engines.current[i]!.audio.playbackRate=v}}/><b>{((rates[i]-1)*100).toFixed(1)}%</b></div><div className="controls"><div className="equalizer"><div className="section-label">ECUALIZADOR <SlidersHorizontal size={12}/></div><div className="eq-bars">{EQ_BANDS.map((band,j)=><div className="eq-band" key={band.frequency}>
 <output className="eq-value" htmlFor={`eq-${label}-${j}`}>{eq[i][j]>0?'+':''}{eq[i][j]}<small> dB</small></output>
 <div className="eq-fader"><span className="eq-zero" aria-hidden="true"/><input id={`eq-${label}-${j}`} aria-label={`${band.name}, ${band.frequency} Hz, deck ${label}`} aria-orientation="vertical" aria-valuetext={`${eq[i][j]} decibelios`} type="range" min="-40" max="12" step="1" value={eq[i][j]} onChange={e=>updateEq(i,eq[i].map((v,k)=>k===j?+e.target.value:v))}/></div>
 <label className="eq-frequency" htmlFor={`eq-${label}-${j}`}>{band.label}<small>Hz</small></label>
 <button className={eq[i][j]===-40?'kill active':'kill'} aria-label={`Atenuar ${band.name} del deck ${label}`} aria-pressed={eq[i][j]===-40} onClick={()=>toggleEqKill(i,j)}>KILL</button>
 </div>)}</div><div className="eq-presets" role="group" aria-label={`Presets de ecualización del deck ${label}`}>{EQ_PRESETS.map(preset=><button key={preset.name} className={eq[i].every((gain,j)=>gain===preset.gains[j])?'active':''} aria-pressed={eq[i].every((gain,j)=>gain===preset.gains[j])} title={preset.name==='Plano'?'Restablecer todas las bandas a 0 dB':`Aplicar preset ${preset.name}`} onClick={()=>updateEq(i,[...preset.gains])}>{preset.name}</button>)}</div></div><div className="filter"><div className="section-label">FILTRO</div><label className="knob filter-knob"><input aria-label={`Filtro deck ${label}`} type="range" min="0" max="100" value={filters[i]} onChange={e=>{const v=+e.target.value;replace(setFilters,i,v);const f=engine(i).filter;f.type=v<=50?'lowpass':'highpass';f.frequency.value=v<=50?80*Math.pow(250,v/50):20*Math.pow(500,(v-50)/50)}}/><span style={{transform:`rotate(${filters[i]*2.5-125}deg)`}}/></label><small>LPF <span>HPF</span></small></div></div><div className="pads"><div><div className="section-label">HOT CUES <span>CLIC: GUARDAR / SALTAR</span></div><div className="pad-buttons">{cues[i].map((v,j)=><button key={j} className={v!==null?'saved':''} title="Clic para guardar o saltar. Clic derecho para borrar." onContextMenu={e=>{e.preventDefault();replace(setCues,i,cues[i].map((x,k)=>k===j?null:x))}} onClick={()=>{const e=engines.current[i];if(!e?.audio.src)return;if(v===null)replace(setCues,i,cues[i].map((x,k)=>k===j?e.audio.currentTime:x));else e.audio.currentTime=v}}>{j+1}</button>)}</div></div><div><div className="section-label">LOOP <span>BEATS</span></div><div className="pad-buttons">{[2,4,8,16].map(n=><button key={n} className={loops[i]===n?'saved':''} onClick={()=>{const e=engines.current[i];if(!e?.audio.src)return;loopStarts.current[i]=e.audio.currentTime;replace(setLoops,i,loops[i]===n?null:n)}}>{n}</button>)}</div></div></div><div className="playlist-head"><span>LISTA DEL DECK {label} <b>{lists[i].length.toString().padStart(2,'0')}</b></span><label className="add-small"><Plus size={13}/> Agregar<input type="file" accept="audio/*" multiple aria-label={`Agregar música al deck ${label}`} onChange={e=>pickFiles(e,i)}/></label></div><div className="playlist" role="region" aria-label={`Lista de canciones del deck ${label}`} tabIndex={0}>{lists[i].length?lists[i].map((song,n)=><div key={n} className={`playlist-track ${selected[i]===n?'selected':''}`}><button onClick={()=>load(i,n)}><span>{String(n+1).padStart(2,'0')}</span><Music2 size={13}/><strong>{song.name}</strong><small>{song.bpm||'—'}</small><small>{clock(song.duration||0)}</small></button><button title="Quitar canción" onClick={()=>{stopAutomix();if(selected[i]===n){engines.current[i]?.audio.pause();if(engines.current[i])engines.current[i]!.audio.removeAttribute('src');replace(setPlaying,i,false)}setLists(old=>old.map((l,j)=>j===i?l.filter((_,k)=>k!==n):l));replace(setSelected,i,selected[i]===n?0:selected[i]>n?selected[i]-1:selected[i])}}><X size={12}/></button></div>):<label className="empty-playlist"><Upload size={22}/><strong>Arrastra tu música aquí</strong><span>o haz clic para explorar · MP3, WAV, OGG</span><input type="file" multiple accept="audio/*" aria-label={`Agregar música al deck ${label}`} onChange={e=>pickFiles(e,i)}/></label>}</div></section>}
 return <div className="app"><header><a className="brand" href="/"><span className="logo"><AudioLines size={25}/></span><span>bpm<span className="brand-light"> demibario</span><small>mixer</small></span></a><nav><span className="live-dot"/> ESTUDIO EN VIVO <span className="version">V 1.0</span></nav><button className="help" aria-expanded={help} aria-controls={help?'console-help':undefined} onClick={()=>{setHelp(!help);if(!help)requestAnimationFrame(()=>document.getElementById('console-help')?.scrollIntoView({block:'start'}))}}><HelpCircle size={16}/> Cómo funciona</button></header><main><div className="workspace-heading"><div><span className="eyebrow">TU MÚSICA. TU MOMENTO.</span><h1>La cabina es tuya<span>.</span></h1><p>Dos decks. Infinitas posibilidades. Dale play a tu creatividad.</p></div><div className="privacy"><ShieldCheck size={17}/><div>100% local y privado<small>Tu música nunca sale de tu navegador</small></div></div></div><div className="studio-grid"><div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void addFiles(e.dataTransfer.files,0)}}>{deck(0)}</div><section className="mixer"><div className="mixer-heading"><SlidersHorizontal size={14}/><h2>MIXER</h2><span className="live-dot"/></div><div className="master-title"><span>MASTER OUT</span><Volume2 size={14}/></div><div className="level-meter">{Array.from({length:25},(_,n)=><i key={n} className={playing.some(Boolean)&&n<master/4?'lit':''}/>)}</div><div className="master-range"><input aria-label="Volumen maestro" type="range" value={master} onChange={e=>setMaster(+e.target.value)}/><span>{master}%</span></div><div className="spectrum-title">ESPECTRO EN VIVO</div><div className="spectrum"><canvas ref={spectrum} width={240} height={72}/><div><span>20 Hz</span><span>1 kHz</span><span>20 kHz</span></div></div><div className="cross-section"><div className="section-label">CROSSFADER <span>CONSTANT POWER</span></div><div className="cross-labels"><b>A</b><span>MEZCLA</span><b>B</b></div><input className="crossfader" aria-label="Crossfader" type="range" value={cross} onChange={e=>{stopAutomix();setCross(+e.target.value)}}/><div className="cross-ticks">┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃</div><button className={`automix ${auto?'active':''}`} aria-pressed={auto} onClick={()=>void automate()}><Zap size={15}/>{auto?'DETENER AUTO MIX':'AUTO MIX'}<span>↔</span></button><p>Transiciones suaves, sin perder el ritmo.</p></div><div className="fx-tabs">{['Efectos','Mis sonidos'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div>{tab==='Efectos'?<div className="fx-grid">{['Sirena','Bocina','Aplausos','Láser','Ruido','Sub drop'].map((name,n)=><button key={name} onClick={()=>effect(n)}><span>{[<Radio/>,<Volume2/>,<AudioLines/>,<Zap/>,<SlidersHorizontal/>,<Disc3/>][n]}</span>{name}<small>FX {String(n+1).padStart(2,'0')}</small></button>)}</div>:<div className="custom-fx">{custom.map((t,n)=><button key={n} onClick={()=>effect(n+6)}><Play size={12}/>{t.name}</button>)}<label><Plus size={18}/> Agregar sonido<input type="file" accept="audio/*" multiple onChange={e=>setCustom(v=>[...v,...Array.from(e.target.files||[]).map(f=>({name:f.name,url:URL.createObjectURL(f)}))])}/></label><p>Sonidos locales para esta sesión.</p></div>}<div className="mixer-foot"><Headphones size={13}/> Hecho para encontrar tu flow</div></section><div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void addFiles(e.dataTransfer.files,1)}}>{deck(1)}</div></div><div className="status-bar"><span><i className="live-dot"/>{message}</span><span><ShieldCheck size={12}/> AUDIO LOCAL <b>•</b> WEB AUDIO ENGINE</span></div>{help&&<div id="console-help" className="help-panel">Agrega tus archivos en cada deck y pulsa play. SYNC iguala el tempo con el otro deck. AUTO MIX está activado al entrar: carga canciones en ambos decks y pulsa play en uno. El otro entra durante los últimos 8 segundos con un fundido e igualación de tempo. Usa el crossfader para mezclar manualmente. Sigue activo y alterna entre A y B al final de cada canción; el deck saliente se pausa y prepara la siguiente pista de su lista. Pulsa DETENER AUTO MIX para desactivarlo. Los loops del deck que suena aplazan el siguiente cambio. El ecualizador tiene seis barras por deck, de 60 Hz a 12 kHz. Sube o baja cada banda y usa los presets Graves, Voz o Brillo; Plano restablece las seis a 0 dB. KILL atenúa una banda a −40 dB y al pulsarlo de nuevo recupera su nivel anterior. Los hot cues guardan la posición actual; clic derecho los borra. Las listas conservan los nombres: vuelve a agregar los archivos al regresar. El tempo se analiza automáticamente en varias secciones y canales. En audio sin un pulso claro puede no detectarse el BPM; la alineación de golpes sigue siendo aproximada.<button aria-label="Cerrar explicación del funcionamiento" onClick={()=>setHelp(false)}><X size={16}/></button></div>}<section className="usage-guide" aria-labelledby="usage-guide-title">
 <div className="guide-heading"><span className="eyebrow">A TU RITMO</span><h2 id="usage-guide-title">Guía de uso de BPM Mixer Studio</h2></div>
 <ol className="guide-steps">
  <li><h3>Cargar canciones y reproducir</h3><p>Añade archivos de audio a cada deck y pulsa Play. Puedes utilizar ambos decks para preparar y combinar canciones.</p></li>
  <li><h3>Sincronización y Auto Mix</h3><p>Pulsa SYNC para igualar el tempo con el otro deck. AUTO MIX permite alternar entre canciones con una transición gradual durante los últimos ocho segundos. Los loops del deck activo pueden aplazar el cambio.</p></li>
  <li><h3>Ecualizador y efectos</h3><p>Ajusta las seis bandas de 60 Hz a 12 kHz. Usa los presets Graves, Voz, Brillo y Plano. La función KILL reduce temporalmente una banda a −40 dB.</p></li>
  <li><h3>Hot cues, loops y crossfader</h3><p>Guarda posiciones con los hot cues, utiliza loops para repetir fragmentos y mueve el crossfader para controlar manualmente la mezcla entre A y B.</p></li>
 </ol>
</section>
<section className="studio-about" aria-labelledby="studio-about-title">
 <h2 id="studio-about-title">BPM Mixer Studio: mezclador DJ online</h2>
 <p>BPM Mixer Studio es una consola DJ virtual que permite mezclar canciones desde el navegador mediante dos decks, sincronización de tempo, ecualización de seis bandas, efectos, loops, hot cues y crossfader. Su función Auto Mix facilita las transiciones automáticas entre pistas, mientras que los controles manuales permiten personalizar cada mezcla. El análisis de BPM ayuda a coordinar el tempo de las canciones, aunque la precisión puede variar según el contenido del audio.</p>
</section><footer><span>bpm demibario mixer <b>/</b> El ritmo lo pones tú.</span><span>Sin instalaciones. Sin subidas. Solo música.</span></footer></main></div>
}
