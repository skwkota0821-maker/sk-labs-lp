const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}});

const extractImage=(data)=>{
  const call=(data?.output||[]).find(x=>x?.type==='image_generation_call'&&x?.result);
  return call?.result||null;
};

const extractText=(data)=>{
  for(const item of data?.output||[]){
    if(item?.type==='message'){
      for(const c of item?.content||[]){
        if(c?.type==='output_text'&&c?.text)return c.text;
      }
    }
  }
  return data?.output_text||'';
};

const parseJsonLoose=(text)=>{
  const clean=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(clean)}catch{}
  const m=clean.match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{return JSON.parse(m[0])}catch{return null}
};

const clampScore=(n)=>Math.max(0,Math.min(100,Number(n)||0));

async function judgeIdentity({apiKey,model,master,candidate,costumeFixed=true}){
  const prompt=`You are a strict manga character continuity QA engine. Compare MASTER CHARACTER with CANDIDATE PANEL. Judge whether they depict the SAME fictional character, not merely a similar character. Ignore pose, expression, camera angle and background. Return JSON only with integer scores 0-100 plus machine-readable drift tags and short Japanese diagnosis.\n\nWeights: face 40, hair 20, body 15, age 10, costume 10, aura 5. Costume may change only when costumeFixed=false. Hard-fail if there is obvious different-person drift, gender drift, age drift, hairstyle identity drift, face-shape drift, or body-type drift.\n\nAllowed drift tags: bangs_length, bangs_shape, hair_volume, hair_color, hairstyle, eye_shape, eye_angle, eye_spacing, jawline, cheek_width, face_width, face_length, nose_shape, mouth_proportion, age_younger, age_older, body_height, shoulder_width, torso_ratio, limb_length, body_type, costume, aura, attractiveness_drift, gender_drift, different_person.\n\nJSON schema: {\"face\":0,\"hair\":0,\"body\":0,\"age\":0,\"costume\":0,\"aura\":0,\"hardFail\":false,\"driftTags\":[\"...\"],\"issues\":[\"...\"],\"diagnosis\":\"...\"}. costumeFixed=${costumeFixed}`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
    model,
    input:[{role:'user',content:[
      {type:'input_text',text:prompt},
      {type:'input_text',text:'MASTER CHARACTER'},
      {type:'input_image',image_url:master,detail:'high'},
      {type:'input_text',text:'CANDIDATE PANEL'},
      {type:'input_image',image_url:candidate,detail:'high'}
    ]}]
  })});
  const data=await r.json();
  if(!r.ok)return {ok:false,error:data?.error?.message||'qa_failed'};
  const q=parseJsonLoose(extractText(data));
  if(!q)return {ok:false,error:'qa_parse_failed'};
  const face=clampScore(q.face),hair=clampScore(q.hair),body=clampScore(q.body),age=clampScore(q.age),costume=clampScore(q.costume),aura=clampScore(q.aura);
  const total=Math.round(face*.40+hair*.20+body*.15+age*.10+costume*.10+aura*.05);
  return {ok:true,total,hardFail:Boolean(q.hardFail),scores:{face,hair,body,age,costume,aura},driftTags:Array.isArray(q.driftTags)?q.driftTags.slice(0,12):[],issues:Array.isArray(q.issues)?q.issues.slice(0,8):[],diagnosis:String(q.diagnosis||'')};
}

function repairLevel(qa){
  const s=qa.scores||{};
  if(qa.hardFail||qa.total<70||s.face<65)return 3;
  if(qa.total<90||s.face<80||s.age<80||s.aura<75)return 2;
  return 1;
}

function buildCorrection(qa){
  const level=repairLevel(qa);
  const tags=new Set(qa.driftTags||[]);
  const fixes=[];
  const keep=['scene','pose','composition','camera angle','lighting','expression'];

  const add=(condition,text)=>{if(condition)fixes.push(text)};
  add(tags.has('bangs_length'),'restore original bangs length');
  add(tags.has('bangs_shape'),'restore original bangs shape');
  add(tags.has('hair_volume'),'restore original hair volume');
  add(tags.has('hair_color'),'restore exact master hair color');
  add(tags.has('hairstyle'),'restore master hairstyle exactly');
  add(tags.has('eye_shape'),'restore original eye shape');
  add(tags.has('eye_angle'),'restore original eye angle');
  add(tags.has('eye_spacing'),'restore original eye spacing');
  add(tags.has('jawline'),'restore original jawline');
  add(tags.has('cheek_width'),'restore original cheek width');
  add(tags.has('face_width'),'restore original face width');
  add(tags.has('face_length'),'restore original facial length ratio');
  add(tags.has('nose_shape'),'restore original nose shape');
  add(tags.has('mouth_proportion'),'restore original mouth proportions');
  add(tags.has('age_younger'),'restore mature master age impression; avoid youthful proportions and oversized eyes');
  add(tags.has('age_older'),'restore original age impression; remove unintended aging');
  add(tags.has('body_height'),'restore original height impression');
  add(tags.has('shoulder_width'),'restore original shoulder width');
  add(tags.has('torso_ratio'),'restore original torso ratio');
  add(tags.has('limb_length'),'restore original limb proportions');
  add(tags.has('body_type'),'restore original body frame and body type');
  add(tags.has('costume'),'restore original clothing design');
  add(tags.has('aura'),'restore original gaze intensity, emotional atmosphere and character presence');
  add(tags.has('attractiveness_drift'),'remove idealization; restore original facial proportions and ordinary attractiveness level');
  add(tags.has('gender_drift'),'restore original gender presentation exactly');
  add(tags.has('different_person'),'recover exact master identity; do not redesign the character');

  if(!fixes.length){
    if((qa.scores?.face||100)<90)fixes.push('restore master facial structure, eye geometry, jawline, cheek proportions and facial balance');
    if((qa.scores?.hair||100)<90)fixes.push('restore master hair shape, bangs, color and volume');
    if((qa.scores?.age||100)<90)fixes.push('restore original age impression');
    if((qa.scores?.body||100)<90)fixes.push('restore original body proportions');
    if((qa.scores?.aura||100)<90)fixes.push('restore original character presence and aura');
  }

  if(level===1){
    return `Character Consistency Correction\n\nDetected Issues:\n${[...(qa.issues||[]),qa.diagnosis].filter(Boolean).map(x=>`- ${x}`).join('\n')}\n\nRequired Fixes:\n${fixes.map(x=>`- ${x}`).join('\n')}\n\nKeep Unchanged:\n${keep.map(x=>`- ${x}`).join('\n')}\n- clothing unless explicitly listed above\n\nPriority:\n1. same person\n2. same face\n3. same character identity\n\nMaster reference has higher priority than scene requirements. Only correct the detected drift.`;
  }

  if(level===2){
    return `Identity Repair Mode\n\nCharacter identity drift detected.\n\nRequired Corrections:\n${fixes.map(x=>`- ${x}`).join('\n')}\n\nMaintain:\n${keep.map(x=>`- ${x}`).join('\n')}\n- approved outfit unless costume is a detected issue\n\nPriority Order:\n1. Identity Match\n2. Face Match\n3. Age Match\n4. Aura Match\n\nDo not beautify, rejuvenate, age, redesign, or reinterpret the character. Master reference overrides all scene requirements.`;
  }

  return `Critical Character Identity Recovery\n\nSevere identity failure detected. Rebuild the candidate from the MASTER CHARACTER, not from the failed attempt.\n\nRestore exactly:\n- facial structure\n- eye geometry\n- jawline and cheek proportions\n- nose and mouth proportions\n- hairstyle, bangs, volume and color\n- age impression\n- body frame and proportions\n- character aura\n${fixes.map(x=>`- ${x}`).join('\n')}\n\nPreserve only:\n${keep.map(x=>`- ${x}`).join('\n')}\n\nDo not preserve any identity traits from the failed image. Same person, same age, same identity. Master reference is absolute.`;
}

async function generateWithReference({apiKey,responseModel,imageModel,reference,prompt,size,correction=''}){
  const instruction=`Use the attached MASTER CHARACTER as the identity anchor. Preserve the exact same fictional character identity: facial structure and proportions, eye shape, nose, mouth, hair color, bangs, hairstyle, apparent age, body frame and overall aura. Preserve the approved outfit unless the scene explicitly requires a change. Create ONE SINGLE manga panel only. No comic grid, no multiple sub-panels, no split screen, no page borders, no captions, no readable text, no logos, no speech balloons. Scene instruction: ${prompt}.${correction?`\n\nQUALITY CORRECTION:\n${correction}`:''}`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
    model:responseModel,
    input:[{role:'user',content:[{type:'input_text',text:instruction},{type:'input_image',image_url:reference,detail:'high'}]}],
    tools:[{type:'image_generation',model:imageModel,input_fidelity:'high',quality:'high',size,output_format:'png'}],
    tool_choice:{type:'image_generation'}
  })});
  const data=await r.json();
  if(!r.ok)return {ok:false,error:data?.error?.message||'reference_generation_failed'};
  const result=extractImage(data);
  if(!result)return {ok:false,error:'empty_image'};
  return {ok:true,image:`data:image/png;base64,${result}`};
}

export default async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}});
  const apiKey=Netlify.env.get('OPENAI_API_KEY');
  const imageModel=Netlify.env.get('MANGA_IMAGE_MODEL')||'gpt-image-2';
  const responseModel=Netlify.env.get('MANGA_RESPONSE_MODEL')||'gpt-5.6';
  const qaModel=Netlify.env.get('MANGA_QA_MODEL')||'gpt-5.6-luna';
  if(req.method==='GET')return json({ok:true,configured:Boolean(apiKey),model:imageModel,mode:'identity-qa-v3.1'});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!apiKey)return json({error:'image_generation_not_configured'},503);
  try{
    const body=await req.json();
    const prompt=String(body?.prompt||'').trim();
    const reference=String(body?.reference||'').trim();
    const size=['1024x1024','1024x1536','1536x1024'].includes(body?.size)?body.size:'1024x1024';
    const costumeFixed=body?.costumeFixed!==false;
    const minScore=Math.max(90,Math.min(99,Number(body?.minScore)||95));
    const maxRetries=Math.max(0,Math.min(3,Number(body?.maxRetries)??2));
    if(!prompt||prompt.length>6000)return json({error:'invalid_prompt'},400);

    if(reference){
      let correction='';
      const attempts=[];
      for(let attempt=0;attempt<=maxRetries;attempt++){
        const generated=await generateWithReference({apiKey,responseModel,imageModel,reference,prompt,size,correction});
        if(!generated.ok)return json({error:'provider_error',detail:generated.error},502);
        const qa=await judgeIdentity({apiKey,model:qaModel,master:reference,candidate:generated.image,costumeFixed});
        if(!qa.ok)return json({error:'qa_error',detail:qa.error},502);
        const level=repairLevel(qa);
        attempts.push({attempt:attempt+1,score:qa.total,repairLevel:level,hardFail:qa.hardFail,driftTags:qa.driftTags,issues:qa.issues,diagnosis:qa.diagnosis});
        if(!qa.hardFail&&qa.total>=minScore){
          return json({image:generated.image,model:imageModel,mode:'identity-qa-v3.1',qa:{status:qa.total>=95?'pass':'conditional',repairLevel:level,...qa,attempts}});
        }
        correction=buildCorrection(qa);
      }
      return json({error:'identity_quality_failed',detail:'Character continuity remained below threshold after automatic retries.',qa:{status:'reject',attempts}},422);
    }

    const strictPrompt=`Create a premium Japanese manga CHARACTER REFERENCE SHEET for one protagonist only. ONE image, not a comic page. Show front portrait, 3/4 portrait, full-body front, and a small expression row, all of the SAME person with identical face and outfit. Clean neutral background. No text, no logos, no speech balloons, no comic panel storytelling. This reference will become the immutable Master Character for continuity QA. Character brief: ${prompt}`;
    const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:imageModel,prompt:strictPrompt,size:'1024x1024',quality:'high',n:1})});
    const data=await r.json();
    if(!r.ok)return json({error:'provider_error',detail:data?.error?.message||'reference_failed'},502);
    const item=data?.data?.[0]||{};
    const image=item.b64_json?`data:image/png;base64,${item.b64_json}`:item.url;
    if(!image)return json({error:'empty_image'},502);
    return json({image,model:imageModel,mode:'master-character'});
  }catch(e){return json({error:'internal_error',detail:String(e?.message||e)},500)}
};

export const config={path:'/api/manga/generate'};
