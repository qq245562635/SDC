from pathlib import Path
from PIL import Image,ImageCms,ImageDraw,ImageFont
from scipy import ndimage as ndi
import numpy as np,math,json,hashlib,colorsys
R=Path.cwd();D=R/'art/delivery/T004';ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
old=json.loads((R/'art/delivery/T002/assets.json').read_text(encoding='utf8'));oldmap={a['file']:a for a in old['assets']}
P=['head','body','arm_l','arm_r','leg_l','leg_r','weapon','back'];Z={'back':0,'leg_l':1,'leg_r':2,'arm_l':3,'body':4,'head':5,'weapon':6,'arm_r':7}
def T(x,y):return np.array([[1.,0,x],[0,1.,y],[0,0,1.]])
def rot(a):
 a=math.radians(a);c,s=math.cos(a),math.sin(a);return np.array([[c,-s,0],[s,c,0],[0,0,1.]])
def pt(M,p):return (M@np.array([*p,1.]))[:2]
def crop_part(sheet,i):
 w,h=sheet.size;r=(round(i%4*w/4),round(i//4*h/2),round((i%4+1)*w/4),round((i//4+1)*h/2));im=sheet.crop(r).convert('RGBA');arr=np.array(im);lab,n=ndi.label(arr[:,:,3]>24,np.ones((3,3)));sz=np.bincount(lab.ravel());sz[0]=0;mask=lab==sz.argmax();arr[:,:,3]=np.where(ndi.binary_dilation(mask,iterations=2),arr[:,:,3],0);im=Image.fromarray(arr);return im.crop(im.getbbox())
C={
'hero':{'neck':[232,101],'body_scale':[.38,.365],'body_joint':[170,280],
 'body_attach':{'neck':[178,35],'shoulder_l':[277,120],'shoulder_r':[75,100],'hip_l':[242,352],'hip_r':[82,344]},
 'parts':{
 'head':[0,[280,317],[.36,.30],0],
 'arm_l':[3,[63,50],[.17,.17],0,[175,320]],
 'arm_r':[2,[151,54],[.32,.22],0,[94,318]],
 'leg_l':[5,[82,33],[.25,.19],0],
 'leg_r':[4,[120,35],[.20,.21],0],
 'weapon':[6,[227,55],[.22,.25],0],
 'back':[7,[180,130],[.22,.22],0,[193,123]]}},
'soldier':{'neck':[205,133],'body_scale':[.36,.32],'body_joint':[150,267],
 'body_attach':{'neck':[165,37],'shoulder_l':[298,100],'shoulder_r':[33,100],'hip_l':[242,326],'hip_r':[68,325]},
 'parts':{
 'head':[0,[185,350],[.43,.34],0],
 'arm_l':[2,[100,50],[.20,.20],110,[230,110]],
 'arm_r':[8,[530,155],[.08,.07],-20,[355,850]],
 'leg_l':[5,[75,30],[.25,.21],0],
 'leg_r':[4,[186,30],[.45,.23],0],
 'weapon':[6,[86,304],[.48,.48],4.6]}},
'archer':{'neck':[227,126],'body_scale':[.39,.33],'body_joint':[150,270],
 'body_attach':{'neck':[160,35],'shoulder_l':[65,130],'shoulder_r':[260,110],'hip_l':[215,330],'hip_r':[90,330]},
 'parts':{
 'head':[0,[267,325],[.39,.34],0],
 'arm_l':[2,[132,36],[.25,.25],5,[82,247]],
 'arm_r':[3,[58,38],[.18,.18],-22,[171,166]],
 'leg_l':[5,[75,30],[.20,.23],0],
 'leg_r':[4,[145,33],[.28,.28],12],
 'weapon':[6,[86,232],[.30,.55],0],
 'back':[7,[140,210],[.22,.22],0,[165,134]]}}
}
def tint(im,color):
 if color=='blue':return im
 a=np.array(im).astype(float)/255;rgb=a[:,:,:3]
 mx=rgb.max(2);mn=rgb.min(2);sat=(mx-mn)/np.maximum(mx,1e-6);mask=(rgb[:,:,2]>rgb[:,:,0]*1.12)&(rgb[:,:,2]>rgb[:,:,1]*1.03)&(sat>.18)
 target=np.array([201,162,58] if color=='yellow' else [176,58,46])/255
 lum=rgb@np.array([.2126,.7152,.0722]);shade=lum/float(np.array([47,93,138])/255@np.array([.2126,.7152,.0722]))
 rgb[mask]=np.minimum(1,target[None,:]*shade[mask,None]);a[:,:,:3]=rgb;return Image.fromarray(np.uint8(np.clip(a*255,0,255)))
records=[];rigs=[];results=[];board=Image.new('RGB',(1260,350*5),'#e9dbc1');draw=ImageDraw.Draw(board);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for row,char in enumerate(['hero','soldier_blue','soldier_yellow','soldier_red','archer']):
 kind='soldier' if char.startswith('soldier') else char;c=C[kind];sheet=Image.open(D/f'sources/{kind}_hidden_parts.png')
 bscale=c['body_scale'];necksrc=c['body_attach']['neck'];neckworld=c['neck']
 BM=T(*neckworld)@np.diag([*bscale,1])@T(*(-np.array(necksrc)))
 worldattach={k:pt(BM,p) for k,p in c['body_attach'].items()};worldpivot=pt(BM,c['body_joint']);foot=np.array([210,290])
 mats={'body':BM};rawpoints={'body':c['body_joint']};partinputs={'body':crop_part(sheet,1)}
 if kind in ('soldier','archer'):
  partinputs['body']=Image.open(D/f'sources/{kind}_closed_torso_cropped.png').convert('RGBA').resize(partinputs['body'].size,Image.Resampling.LANCZOS)
 if kind=='soldier':
  mats['body']=BM@T(220,necksrc[1])@np.diag([1.38,1,1])@T(-220,-necksrc[1])
  rawpoints['body']=pt(np.linalg.inv(mats['body']),worldpivot).tolist()
 for part,spec in c['parts'].items():
  i,piv,scale,angle,*extra=spec;im=Image.open(D/'sources/soldier_near_arm_cropped.png').convert('RGBA') if i==8 else crop_part(sheet,i)
  if kind=='hero' and part=='back':im=im.crop((0,0,225,im.height))
  if part=='head':anchor=worldattach['neck']
  elif part.startswith('arm_'):anchor=worldattach['shoulder_'+part[-1]]
  elif part.startswith('leg_'):anchor=worldattach['hip_'+part[-1]]
  elif part=='back':anchor=np.array(extra[0],float)
  elif part=='weapon':
   arm=c['parts']['arm_r'];anchor=pt(mats['arm_r'],arm[4])
  M=T(*anchor)@rot(angle)@np.diag([*scale,1])@T(*(-np.array(piv)))
  mats[part]=M;rawpoints[part]=piv;partinputs[part]=im
 # Calibrate actor height against the unchanged idle reference.
 raw=Image.new('RGBA',(420,300))
 for part in sorted(mats,key=lambda p:Z[p]):
  iv=np.linalg.inv(mats[part]);raw.alpha_composite(partinputs[part].transform((420,300),Image.Transform.AFFINE,tuple(iv[:2,:].reshape(-1)),Image.Resampling.BICUBIC))
 rmask=np.array(Image.open(R/f'art/char/char_{char}_idle_01.png').convert('RGBA'))[:,:,3]>24
 lab,n=ndi.label(rmask,np.ones((3,3)));sz=np.bincount(lab.ravel());sz[0]=0;rmask=lab==sz.argmax()
 yref=np.where(rmask)[0];ynow=np.where(np.array(raw)[:,:,3]>24)[0]
 gy=(yref.max()-yref.min())/(ynow.max()-ynow.min())
 G=T(0,float(yref.min()))@np.diag([1,gy,1])@T(0,-float(ynow.min()))
 mats={p:G@M for p,M in mats.items()};worldattach={k:pt(G,p) for k,p in worldattach.items()}
 assembled=Image.new('RGBA',(420,300));layers={}
 for part in sorted(mats,key=lambda p:Z[p]):
  im=partinputs[part]
  if kind=='soldier':im=tint(im,char.split('_')[-1])
  inv=np.linalg.inv(mats[part]);layer=im.transform((420,300),Image.Transform.AFFINE,tuple(inv[:2,:].reshape(-1)),Image.Resampling.BICUBIC)
  worldjoint=pt(mats[part],rawpoints[part])
  # Extend a painted, concealed 10px shoulder/hip/neck cap from adjacent material.
  if part not in ('weapon','back','body'):
   arr=np.array(layer);opaque=arr[:,:,3]>32
   if opaque.any():
    inds=ndi.distance_transform_edt(~opaque,return_distances=False,return_indices=True);y,x=np.mgrid[:300,:420]
    capjoint=worldattach['shoulder_r'] if part=='body' else worldjoint
    capradius=32 if part=='body' else 10
    cap=(x-capjoint[0])**2+(y-capjoint[1])**2<=capradius**2
    arr[:,:,:3]=np.where((cap&~opaque)[:,:,None],arr[:,:,:3][tuple(inds)],arr[:,:,:3]);arr[:,:,3]=np.where(cap,np.maximum(arr[:,:,3],250),arr[:,:,3]);layer=Image.fromarray(arr)
  bbox=layer.getbbox();points=[worldjoint]
  if part=='body':points+=list(worldattach.values())
  if part.startswith('arm_'):handworld=pt(mats[part],c['parts'][part][4]);points.append(handworld)
  left=max(0,math.floor(min([bbox[0]]+[p[0] for p in points]))-4);top=max(0,math.floor(min([bbox[1]]+[p[1] for p in points]))-4)
  right=min(420,math.ceil(max([bbox[2]]+[p[0] for p in points]))+4);bottom=min(300,math.ceil(max([bbox[3]]+[p[1] for p in points]))+4)
  crop=layer.crop((left,top,right,bottom));local=lambda p:[round(float(p[0]-left),4),round(float(p[1]-top),4)]
  file=f'art/char/char_{char}_{part}_01.png';path=R/file;crop.save(path,optimize=True,icc_profile=ICC)
  rec={'file':file,'requirement':{'hero':'C01','soldier':'C02','archer':'C03'}[kind],'character':char,'part':part,'role':'part','size_px':list(crop.size),'display_scale':.5,'content_bbox':crop.getbbox(),'joint_pivot':local(worldjoint),'origin_normalized':[local(worldjoint)[0]/crop.width,local(worldjoint)[1]/crop.height],'rest_position':[round(float(worldjoint[0]-foot[0]),4),round(float(worldjoint[1]-foot[1]),4)],'z':Z[part],'source':f'art/delivery/T004/sources/{kind}_hidden_parts.png','source_joint_pivot':rawpoints[part],'registration':mats[part].tolist(),'method':'Complete AI-repainted side cutout; measured anatomical pivots and fitted rest transforms. No baked-in neighboring limbs or weapon pixels.','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
  if part=='body':rec['attach']={k:local(p) for k,p in worldattach.items()}
  if part.startswith('arm_'):rec['hand']=local(handworld)
  if part=='weapon':rec['grip']=local(worldjoint)
  if part=='body' and kind in ('soldier','archer'):rec['source']=f'art/delivery/T004/sources/{kind}_closed_torso_cropped.png'
  if part=='arm_r' and kind=='soldier':rec['source']='art/delivery/T004/sources/soldier_near_arm_cropped.png'
  rec.pop('source_joint_pivot',None);rec.pop('registration',None)
  records.append(rec);oldmap[file].update(rec)
  for stale in ('joint_pivot_hint','source_rect','source_joint_pivot','registration'):oldmap[file].pop(stale,None)
  assembled.alpha_composite(crop,(left,top));layers[part]=rec
 rig={'character':char,'reference':f'art/char/char_{char}_idle_01.png','reference_size':[420,300],'foot_px':foot.tolist(),'body_rest_position':layers['body']['rest_position'],'parts':[r['file'] for r in layers.values()]}
 rigs.append(rig)
 ref=Image.open(R/rig['reference']).convert('RGBA');rm=np.array(ref)[:,:,3]>24
 lab,n=ndi.label(rm,np.ones((3,3)));sz=np.bincount(lab.ravel());sz[0]=0;rm=lab==sz.argmax();am=np.array(assembled)[:,:,3]>24
 edge=lambda a:a&~ndi.binary_erosion(a)
 ae,re=edge(am),edge(rm);d1=ndi.distance_transform_edt(~re)[ae].max();d2=ndi.distance_transform_edt(~ae)[re].max()
 err=max(float(d1),float(d2))*.5
 results.append({'character':char,'outline_max_error_display_px':err,'assembled_height_source_px':int(np.where(am)[0].max()-np.where(am)[0].min()+1),'reference_height_source_px':int(np.where(rm)[0].max()-np.where(rm)[0].min()+1)})
 comparison=Image.new('RGBA',(1260,300),'#e9dbc1');comparison.alpha_composite(ref);comparison.alpha_composite(assembled,(420,0));comparison.alpha_composite(ref,(840,0))
 arr=np.zeros((300,420,4),np.uint8);arr[re]=[220,70,30,255];arr[ae]=[20,160,180,255];comparison.alpha_composite(Image.fromarray(arr),(840,0));board.paste(comparison,(0,row*350),comparison);draw.text((10,row*350+315),char+' | original idle | complete rebuilt cutouts | red/cyan silhouettes; error='+str(round(err,2))+'px',font=font,fill='#2b1d16')
 assembled.save(D/'qa'/f'{char}_assembled.png')
manifest={'task':'T004','units':'pixels at 2x display size','convention':'All joint_pivot/attach/hand/grip are measured local image pixels. Body root offset and back use rest_position; head/limbs use body.attach, weapon uses arm_r.hand.','rigs':rigs,'assets':records+[a for a in old['assets'] if a['requirement']=='E01']}
(D/'assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8');(R/'art/delivery/T002/assets.json').write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(D/'qa/rig_validation.json').write_text(json.dumps({'rigs':results,'runtime_confirmation':'Pending programmer'},indent=2)+'\n')
board.save(D/'qa/rig_complete_comparison.png');print(json.dumps(results,indent=2))

