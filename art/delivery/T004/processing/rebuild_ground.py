from pathlib import Path
from PIL import Image, ImageCms
from scipy import ndimage as ndi
import numpy as np, json, hashlib
R=Path.cwd(); D=R/'art/delivery/T004'
icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
sheet=Image.open(D/'sources/ground_revision2_atlas.png').convert('RGB');W,H=sheet.size
soil=Image.open(D/'sources/ground_revision2_soil.png').convert('RGB')
weights=np.array([.2126,.7152,.0722])
yy,xx=np.mgrid[:256,:256];dist=np.minimum.reduce([xx,yy,255-xx,255-yy])
edge=dist<24;core=~edge
samples=[]
cells=[]
for i in range(16):
 box=(round(i%4*W/4),round(i//4*H/4),round((i%4+1)*W/4),round((i//4+1)*H/4))
 a=np.array(sheet.crop(box).resize((256,256),Image.Resampling.LANCZOS)).astype(float)
 cells.append((a,box));samples.append(a[edge])
color=np.median(np.concatenate(samples),axis=0)
# Full painted texture, downsampled once. No small repeated patch or reflection.
base=np.array(soil.resize((256,256),Image.Resampling.LANCZOS)).astype(float)
base+=color-np.mean(base,axis=(0,1))
# Fine edge grain only; average opposite edge samples without mirroring motifs.
base[0]=base[-1]=(base[0]+base[-1])/2
base[:,0]=base[:,-1]=(base[:,0]+base[:,-1])/2
band_lum=float((base@weights)[edge].mean())
t=np.clip((dist-24)/20,0,1);t=t*t*(3-2*t)
manifest=json.loads((D/'assets.json').read_text(encoding='utf8'))
legacy=json.loads((R/'art/delivery/T002/assets.json').read_text(encoding='utf8'))
by={a['file']:a for a in legacy['assets']}
manifest['assets']=[a for a in manifest['assets'] if a['requirement']!='E01']
atlas=Image.new('RGB',(1024,1024));stats=[];tiles=[]
for i,(a,box) in enumerate(cells):
 lum=a@weights
 dirt=(a[:,:,0]>a[:,:,1]*1.18)&(a[:,:,1]>a[:,:,2]*1.35)&(lum>115)&(lum<185)
 # Remove residual lighting drift using only ground material, not prop color.
 den=ndi.gaussian_filter(dirt.astype(float),32)
 est=ndi.gaussian_filter(a*dirt[:,:,None],(32,32,0))/np.maximum(den[:,:,None],1e-6)
 est=np.where((den>.1)[:,:,None],est,color)
 a=np.clip(a+color-est,0,255)
 a=a*t[:,:,None]+base*(1-t[:,:,None])
 # Smaller, sparse feature clusters retain readable props without dark central slabs.
 # Resample the painted residual only; keep native fine-soil texture continuous.
 residual=a-base
 scale=.52;side=round(256*scale)
 small=np.stack([ndi.zoom(residual[:,:,c],side/256,order=1) for c in range(3)],axis=2)
 prng=np.random.default_rng(400420+i);left=int(prng.integers(12,112));top=int(prng.integers(44,79))
 a=base.copy();a[top:top+side,left:left+side]+=small
 a=np.rint(a).clip(0,255).astype(np.uint8)
 p=R/f'art/env/env_camp_tile{i+1:02}_01.png'
 Image.fromarray(a).save(p,optimize=True,icc_profile=icc);tiles.append(a)
 atlas.paste(Image.fromarray(a),(i%4*256,i//4*256))
 lum=a@weights;el=float(lum[edge].mean());cl=float(lum[core].mean())
 stats.append({'tile':i+1,'edge_mean_luminance':round(el,4),'center_mean_luminance':round(cl,4),'relative_difference_percent':round(abs(cl-el)/el*100,4)})
 rec=by[p.relative_to(R).as_posix()]
 rec.update(source='art/delivery/T004/sources/ground_revision2_atlas.png',source_rect=list(box),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),edge_processing='Full AI-painted fine-soil substrate at native tile scale, no mirrored patches; shared 24px bands, 20px smooth transition; painted feature clusters scaled 0.52 and offset to avoid dark tile-sized center slabs.')
 manifest['assets'].append(rec)
for a in tiles:
 for b in tiles:
  assert np.array_equal(a[:,-1],b[:,0]) and np.array_equal(a[-1],b[0])
  for sl in [np.s_[:24,:],np.s_[-24:,:],np.s_[:,:24],np.s_[:,-24:]]:assert np.array_equal(a[sl],b[sl])
atlas.save(D/'qa/ground_4x4.png',icc_profile=icc)
# Stratified random sampling: all 16 tile types appear four times, seed fixed.
seed=40042;rng=np.random.default_rng(seed);layout=rng.permutation(np.tile(np.arange(16),4)).reshape(8,8)
mixed=Image.new('RGB',(2048,2048))
for y in range(8):
 for x in range(8):mixed.paste(Image.fromarray(tiles[layout[y,x]]),(x*256,y*256))
mixed.save(D/'qa/ground_8x8_random.png',icc_profile=icc)
(D/'qa/ground_8x8_layout.json').write_text(json.dumps({'seed':seed,'tiles_1based':(layout+1).tolist()},indent=2)+'\n')
report={'review_comment':6655930274,'measurement':'Full RGB Rec.709 weighted luma at source resolution, including props. Edge: outer 24px ring. Center: all remaining 208x208 pixels. Percent: abs(center_mean-edge_mean)/edge_mean*100; no masked soil selection.','matching_edge_pairs':256,'shared_band_px':24,'feature_scale':.52,'feature_position_jitter':'Deterministic per-tile offsets within shared border; no mirrors','max_relative_difference_percent':max(v['relative_difference_percent'] for v in stats),'threshold_percent':5,'tiles':stats}
assert report['max_relative_difference_percent']<=5,report
(D/'qa/ground_validation.json').write_text(json.dumps(report,indent=2)+'\n')
(D/'assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(R/'art/delivery/T002/assets.json').write_text(json.dumps(legacy,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))

