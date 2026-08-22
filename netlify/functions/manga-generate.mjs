const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}});

const extractImage=(data)=>{
  const call=(data?.output||[]).find(x=>x?.type==='image_generation_call'&&x?.result);
  return call?.result||null;
};

export default async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}});
  const apiKey=Netlify.env.get('OPENAI_API_KEY');
  const imageModel=Netlify.env.get('MANGA_IMAGE_MODEL')||'gpt-image-2';
  const responseModel=Netlify.env.get('MANGA_RESPONSE_MODEL')||'gpt-5.6';
  if(req.method==='GET')return json({ok:true,configured:Boolean(apiKey),model:imageModel,mode:'reference-v2'});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!apiKey)return json({error:'image_generation_not_configured'},503);
  try{
    const body=await req.json();
    const prompt=String(body?.prompt||'').trim();
    const reference=String(body?.reference||'').trim();
    const size=['1024x1024','1024x1536','1536x1024'].includes(body?.size)?body.size:'1024x1024';
    if(!prompt||prompt.length>6000)return json({error:'invalid_prompt'},400);

    if(reference){
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
        model:responseModel,
        input:[{role:'user',content:[
          {type:'input_text',text:`Use the attached character reference as the identity/style anchor. Preserve the same protagonist facial structure, hairstyle, apparent age, body proportions, outfit design and overall illustration style. Create ONE SINGLE manga panel only. No comic grid, no multiple sub-panels, no split screen, no page borders, no captions, no readable text, no speech balloons. Scene instruction: ${prompt}`},
          {type:'input_image',image_url:reference,detail:'high'}
        ]}],
        tools:[{type:'image_generation',model:imageModel,input_fidelity:'high',quality:'high',size,output_format:'png'}],
        tool_choice:{type:'image_generation'}
      })});
      const data=await r.json();
      if(!r.ok)return json({error:'provider_error',detail:data?.error?.message||'reference_generation_failed'},502);
      const result=extractImage(data);
      if(!result)return json({error:'empty_image'},502);
      return json({image:`data:image/png;base64,${result}`,model:imageModel,mode:'reference'});
    }

    const strictPrompt=`Create a premium Japanese manga CHARACTER REFERENCE SHEET for one protagonist only. ONE image, not a comic page. Show front portrait, 3/4 portrait, full-body front, and a small expression row, all of the SAME person with identical face and outfit. Clean neutral background. No text, no logos, no speech balloons, no comic panel storytelling. This reference will be used to keep identity consistent across later scenes. Character brief: ${prompt}`;
    const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:imageModel,prompt:strictPrompt,size:'1024x1024',quality:'high',n:1})});
    const data=await r.json();
    if(!r.ok)return json({error:'provider_error',detail:data?.error?.message||'reference_failed'},502);
    const item=data?.data?.[0]||{};
    const image=item.b64_json?`data:image/png;base64,${item.b64_json}`:item.url;
    if(!image)return json({error:'empty_image'},502);
    return json({image,model:imageModel,mode:'reference-sheet'});
  }catch(e){return json({error:'internal_error',detail:String(e?.message||e)},500)}
};

export const config={path:'/api/manga/generate'};
