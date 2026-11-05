from pathlib import Path
from PIL import Image,ImageCms,ImageDraw,ImageFont
import numpy as np, json, hashlib, math
R=Path.cwd();D=R/'art/delivery/T004';S=D/'sources/ground_layers';Q=D/'qa';Q.mkdir(exist_ok=True)
ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
manifest=json.loads((D/'assets.json').read_text(encoding='utf8'))
is_new=lambda a:a['file'].startswith('art/env/env_ground_base_') or a['file'].startswith('art/env/env_decal_')
manifest['assets']=[a for a in manifest['assets'] if not is_new(a)]
records=[];bases=[];stats=[]
def emit(im,name,role,origin,source,**extra):
 p=R/'art/env'/name;im.save(p,optimize=True,icc_profile=ICC)
 rec={'file':p.relative_to(R).as_posix(),'requirement':'E01','role':role,'size_px':list(im.size),'display_scale':1,'origin_normalized':origin,'content_bbox':im.getbbox(),'source':source.relative_to(R).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),**extra}
 records.append(rec);return rec
raw=[np.array(Image.open(S/f'base_{i+1}.png').convert('RGB').resize((128,128),Image.Resampling.LANCZOS)).astype(float) for i in range(4)]
target=np.mean([a.mean(axis=(0,1)) for a in raw],axis=0)
raw=[a+target-a.mean(axis=(0,1)) for a in raw]
# Register only fine edge samples. Preserve painted material throughout the tile.
h=np.mean([a[y] for a in raw for y in [0,-1]],axis=0)
v=np.mean([a[:,x] for a in raw for x in [0,-1]],axis=0)
corner=(h[0]+h[-1]+v[0]+v[-1])/4;h[0]=h[-1]=v[0]=v[-1]=corner
for i,a in enumerate(raw):
 # Smoothly approach shared rows from unmodified paint (avoid cumulative edits).
 b=a.copy()
 for k in range(6):
  w=(1-k/6)**2
  b[k]=(1-w)*a[k]+w*h;b[-1-k]=(1-w)*a[-1-k]+w*h
 for k in range(6):
  w=(1-k/6)**2
  b[:,k]=(1-w)*b[:,k]+w*v;b[:,-1-k]=(1-w)*b[:,-1-k]+w*v
 b[0]=b[-1]=h;b[:,0]=b[:,-1]=v
 a=np.rint(b).clip(0,255).astype(np.uint8);bases.append(a)
 rec=emit(Image.fromarray(a),f'env_ground_base_{i+1:02}.png','ground_base',[.5,.5],S/f'base_{i+1}.png',rotation_allowed=False,tileable_with=[f'env_ground_base_{j:02}.png' for j in range(1,5)])
 lum=a@np.array([.2126,.7152,.0722]);edge=np.ones((128,128),bool);edge[8:-8,8:-8]=False
 stats.append({'file':rec['file'],'mean_rgb':a.mean(axis=(0,1)).round(3).tolist(),'edge_mean_luminance':round(float(lum[edge].mean()),4),'inner_mean_luminance':round(float(lum[~edge].mean()),4),'edge_inner_difference_percent':round(float(abs(lum[edge].mean()-lum[~edge].mean())/lum[edge].mean()*100),4)})
for a in bases:
 for b in bases:
  assert np.array_equal(a[:,-1],b[:,0]) and np.array_equal(a[-1],b[0])
specs={'grass':(80,[.5,.85],False,[0]),'stone':(88,[.5,.78],False,[0]),'rut':(210,[.5,.5],True,[0,180]),'footprint':(175,[.5,.5],True,None),'mud':(170,[.5,.5],True,None),'crack':(155,[.5,.5],True,None),'ink':(135,[.5,.5],True,None)}
decal_meta={};contact=Image.new('RGB',(896,4*208),'#b09c7c');dr=ImageDraw.Draw(contact);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
for cat,(size,origin,allow,angles) in specs.items():
 for i in [1,2]:
  src=S/f'{cat}_{i}.png';im=Image.open(src).convert('RGBA');arr=np.array(im)
  # Drop near-invisible alpha noise only; retain irregular soft edges and scattered flecks.
  arr[:,:,3]=np.where(arr[:,:,3]<5,0,arr[:,:,3])
  active=arr[:,:,3]>12;ys,xs=np.where(active);box=(max(0,int(xs.min())-12),max(0,int(ys.min())-12),min(im.width,int(xs.max())+13),min(im.height,int(ys.max())+13))
  im=Image.fromarray(arr).crop(box);im.thumbnail((size,size),Image.Resampling.LANCZOS)
  pad=4;out=Image.new('RGBA',(im.width+pad*2,im.height+pad*2));out.alpha_composite(im,(pad,pad))
  rec=emit(out,f'env_decal_{cat}_{i:02}.png','ground_decal',origin,src,category=cat,rotation_allowed=allow,rotation_mode='free' if angles is None else ('discrete' if allow else 'none'),allowed_rotation_degrees=angles,scale_range=[.75,1.25],placement='Free world coordinates, independent of tile grid',z=0 if cat not in ['grass','stone'] else 1,source_rect=list(box))
  decal_meta[cat,i]=(out,rec)
  idx=len(decal_meta)-1;preview=out.copy();preview.thumbnail((210,177));x=idx%4*224;y=idx//4*208
  contact.paste(preview,(x+(224-preview.width)//2,y+25+(177-preview.height)//2),preview);dr.text((x+8,y+4),f'{cat}_{i:02}',font=font,fill='#2b1d16')
contact.save(Q/'ground_decal_contact.png')
# Two independently randomized dimensions: base choice per cell, decals in world space.
seed=40043;rng=np.random.default_rng(seed);W,H=1280,720;room=Image.new('RGBA',(W,H));layout=rng.integers(0,4,size=(math.ceil(H/128),math.ceil(W/128)))
for y,row in enumerate(layout):
 for x,index in enumerate(row):room.paste(Image.fromarray(bases[index]),(x*128,y*128))
room.convert('RGB').save(Q/'ground_bases_room.png')
categories=['grass']*9+['stone']*7+['rut']*5+['footprint']*5+['mud']*5+['crack']*5+['ink']*4
rng.shuffle(categories);placements=[];points=[];variant_counts={cat:0 for cat in specs}
for j,cat in enumerate(categories):
 for attempt in range(1000):
  x=float(rng.uniform(45,W-45));y=float(rng.uniform(45,H-45))
  if all((x-px)**2+(y-py)**2>78**2 for px,py in points):break
 points.append((x,y));variant=variant_counts[cat]%2+1;variant_counts[cat]+=1;im,rec=decal_meta[cat,variant];scale=float(rng.uniform(.75,1.25));angles=rec['allowed_rotation_degrees']
 angle=float(rng.uniform(0,360)) if angles is None else float(rng.choice(angles))
 placements.append({'file':rec['file'],'position':[round(x,4),round(y,4)],'rotation_degrees':round(angle,4),'scale':round(scale,4),'origin_normalized':rec['origin_normalized'],'z':rec['z']})
for p in sorted(placements,key=lambda p:(p['z'],p['position'][1])):
 rec=next(a for a in records if a['file']==p['file']);im=Image.open(R/p['file']).convert('RGBA')
 im=im.resize((round(im.width*p['scale']),round(im.height*p['scale'])),Image.Resampling.BICUBIC)
 ox,oy=np.array(p['origin_normalized'])*np.array(im.size);cx,cy=np.array(im.size)/2
 out=im.rotate(p['rotation_degrees'],resample=Image.Resampling.BICUBIC,expand=True)
 a=math.radians(p['rotation_degrees']);dx,dy=ox-cx,oy-cy
 px=out.width/2+math.cos(a)*dx+math.sin(a)*dy;py=out.height/2-math.sin(a)*dx+math.cos(a)*dy
 room.alpha_composite(out,(round(p['position'][0]-px),round(p['position'][1]-py)))
room.convert('RGB').save(Q/'ground_layered_room_1280x720.png',icc_profile=ICC)
manifest['assets']+=records
manifest['units']='Final PNG source pixels; display_scale on each record specifies native/2x display scaling.'
manifest['ground_surface']={'review_comment':6656771262,'mode':'base_plus_decals','base_display_size_px':[128,128],'base_files':[a['file'] for a in records if a['role']=='ground_base'],'decal_files':[a['file'] for a in records if a['role']=='ground_decal'],'legacy_tiles':'env_camp_tile01_01.png through env_camp_tile16_01.png retained unchanged; programmer switches explicitly','placement':'Base tiles have no theme patterns. Place decals in continuous world space independently of tile coordinates; honor per-asset rotation_mode, allowed_rotation_degrees, origin_normalized and scale_range.'}
(D/'assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(Q/'ground_layered_layout.json').write_text(json.dumps({'seed':seed,'preview_size':[W,H],'tile_size':[128,128],'base_indices_1based':(layout+1).tolist(),'decal_count':len(placements),'decals':placements},indent=2)+'\n')
report={'review_comment':6656771262,'base_count':4,'decal_count':14,'categories':{cat:2 for cat in specs},'base_size_px':[128,128],'seam_pairs_horizontal':16,'seam_pairs_vertical':16,'measurement':'Base only. Outer 8px ring vs inner 112x112; all pixels, Rec.709 weighted RGB. Decals are separate and excluded by construction.','bases':stats,'room_preview_size':[W,H],'room_decal_count':40,'runtime_confirmation':'Pending programmer; room is an art-data composition, not a screenshot of game runtime.'}
(Q/'ground_layered_validation.json').write_text(json.dumps(report,indent=2)+'\n')
assert len(placements)==40 and room.size==(1280,720)
assert max(t['edge_inner_difference_percent'] for t in stats)<=5
print(json.dumps(report,indent=2))

