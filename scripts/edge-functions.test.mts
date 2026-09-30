// Edge Function（/api/apod・/api/weather）の単体テスト。外部APIはモックする
import assert from 'node:assert';
(globalThis as any).Netlify = { env: { get: () => undefined } };
const apod = await import('../netlify/edge-functions/apod.ts');
const weather = await import('../netlify/edge-functions/weather.ts');

// --- APOD ---
let calls: string[] = [];
(globalThis as any).fetch = async (u: any) => { calls.push(String(u));
  if (String(u).includes('date=')) return new Response(JSON.stringify({title:'Yesterday',date:'2026-09-29',url:'https://apod.nasa.gov/x.jpg',media_type:'image'}),{status:200});
  return new Response('rate', {status:429}); };
let r = await apod.default();
let j = await r.json();
assert.equal(r.status,200); assert.equal(j.title,'Yesterday'); assert.equal(j.pageUrl,'https://apod.nasa.gov/apod/ap260929.html');
assert.match(r.headers.get('Netlify-CDN-Cache-Control')!, /s-maxage=3600/);
assert.ok(calls[0].includes('api_key=DEMO_KEY') && calls[0].includes('thumbs=true'));
(globalThis as any).fetch = async () => new Response(JSON.stringify({title:'Vid',date:'2026-09-30',url:'https://youtube',media_type:'video',thumbnail_url:'https://img/t.jpg'}),{status:200});
j = await (await apod.default()).json(); assert.equal(j.image,'https://img/t.jpg');
(globalThis as any).fetch = async () => { throw new Error('net'); };
r = await apod.default(); assert.equal(r.status,502); assert.equal(r.headers.get('Cache-Control'),'no-store');
assert.equal(apod.jstDateString(1,new Date('2026-09-30T02:00:00Z')),'2026-09-29');

// --- Weather (JMA shaped) ---
const jma = (code:string,name:string)=>[{reportDatetime:'2026-09-30T11:00:00+09:00',timeSeries:[
  {timeDefines:['2026-09-30T11:00:00+09:00','2026-10-01T00:00:00+09:00'],areas:[{area:{name:'西部',code:'x'},weathers:['雨','雨']},{area:{name,code},weathers:['晴れ　夜　くもり','くもり　時々　雨']}]},
  {timeDefines:['2026-09-30T06:00:00+09:00','2026-09-30T12:00:00+09:00','2026-09-30T18:00:00+09:00','2026-10-01T00:00:00+09:00'],areas:[{area:{name:'西部',code:'x'},pops:['0','0','0','0']},{area:{name,code},pops:['0','10','20','30']}]}
]},{}];
(globalThis as any).fetch = async (u:any) => { const s=String(u);
  if (s.includes('474000')) return new Response('err',{status:500});
  const office=s.match(/(\d{6})\.json/)![1];
  const place=weather.PLACES.find((p:any)=>p.office===office)!;
  return new Response(JSON.stringify(jma(place.area,'テスト地方')),{status:200}); };
const realNow = Date.now;
const W='https://sk-labs.net/api/weather';
r = await weather.default(new Request(W)); j = await r.json();
assert.equal(r.status,200);
const y = j.places[0]; assert.equal(y.id,'yokohama'); assert.equal(y.weather,'晴れ 夜 くもり'); assert.equal(y.tomorrow,'くもり 時々 雨');
assert.equal(j.places[3], null);
const s = weather.summarize(weather.PLACES[0], jma('140010','東部'), new Date('2026-09-30T13:00:00+09:00'));
assert.deepEqual(s!.pops.map((p:any)=>p.pop),[10,20,30]);
(globalThis as any).fetch = async () => { throw new Error('net'); };
r = await weather.default(new Request(W)); assert.equal(r.status,502);
// 地域指定（許可リスト外は400）
r = await weather.default(new Request(W+'?office=999999')); assert.equal(r.status,400);
r = await weather.default(new Request(W+'?office=../../x')); assert.equal(r.status,400);
(globalThis as any).fetch = async (u:any) => { assert.ok(String(u).endsWith('/130000.json')); return new Response(JSON.stringify(jma('130020','伊豆諸島北部')),{status:200}); };
r = await weather.default(new Request(W+'?office=130000')); j = await r.json();
assert.equal(r.status,200); assert.equal(j.areas.length,2); assert.equal(j.areas[1].area,'伊豆諸島北部'); assert.equal(r.headers.get('Netlify-Vary'),'query=office');
(globalThis as any).fetch = async () => new Response('x',{status:500});
r = await weather.default(new Request(W+'?office=130000')); assert.equal(r.status,502);
console.log('edge function tests: all passed');
