from pathlib import Path
from PIL import Image,ImageCms
from scipy import ndimage as ndi
import numpy as np,json,hashlib
R=Path.cwd();D=R/'art/delivery/T004';m=json.loads((D/'assets.json').read_text(encoding='utf8'))
old=json.loads((R/'art/delivery/T002/assets.json').read_text(encoding='utf8'));by={a['file']:a for a in old['assets']};m['assets']=[a for a in m['assets'] if a['requirement']!='E01']
icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
sheet=Image.open(D/'sources/ground_repaint.png').convert('RGB');W,H=sheet.size
color=np.array(Image.open(D/'sources/ground_before.png'))[0,0,:3].astype(float)
weights=np.array([.2126,.7152,.0722]);target=float(color@weights)
patch=np.array(sheet.crop((10,140,138,236))).astype(float)
rng=np.random.default_rng(4004)
patch=patch-np.median(patch.reshape(-1,3),axis=0)+color;patch=np.clip(patch,color-np.array([20,18,15]),color+np.array([20,18,15]))
period=np.concatenate([patch,patch[:,::-1]],axis=1);period=np.concatenate([period,period[::-1]],axis=0)
common=np.array(Image.fromarray(np.uint8(np.clip(period,0,255))).resize((256,256),Image.Resampling.BILINEAR)).astype(float)
common[-1]=common[0];common[:,-1]=common[:,0]
atlas=Image.new('RGB',(1024,1024));stats=[]
yy,xx=np.mgrid[:256,:256];dist=np.minimum.reduce([xx,yy,255-xx,255-yy])
blend=np.clip((dist-24)/16,0,1);blend=blend*blend*(3-2*blend)
for i in range(16):
 box=(round(i%4*W/4),round(i//4*H/4),round((i%4+1)*W/4),round((i//4+1)*H/4))
 a=np.array(sheet.crop(box).resize((256,256),Image.Resampling.LANCZOS)).astype(float);lum=a@weights
 soil=(a[:,:,0]>a[:,:,1]*1.16)&(a[:,:,1]>a[:,:,2]*1.20)&(lum>target*.74)&(lum<target*1.26)
 den=ndi.gaussian_filter(soil.astype(float),24);est=ndi.gaussian_filter(lum*soil,24)/np.maximum(den,1e-5);est=np.where(den>.05,est,target)
 a=np.clip(a+(target-est)[:,:,None],0,255)
 for _ in range(3):
  l=a@weights;center=soil&(dist>64)
  if center.any():a=np.clip(a+(target-float(np.median(l[center]))),0,255)
 a=np.rint(a*blend[:,:,None]+common*(1-blend[:,:,None])).clip(0,255).astype(np.uint8)
 p=R/f'art/env/env_camp_tile{i+1:02}_01.png';Image.fromarray(a).save(p,optimize=True,icc_profile=icc);atlas.paste(Image.fromarray(a),(i%4*256,i//4*256))
 rec=by[p.relative_to(R).as_posix()];rec.update({'source':'art/delivery/T004/sources/ground_repaint.png','source_rect':list(box),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'edge_processing':'Shared tileable rice-paper dirt grain across all 24px boundary bands; 16px blend into individually illumination-normalized painted interiors.'});m['assets'].append(rec)
 stats.append({'tile':i+1,'center_soil_minus_target_luminance':round(float(np.median((a@weights)[center])-target),3)})
tiles=[np.array(Image.open(R/f'art/env/env_camp_tile{i+1:02}_01.png')) for i in range(16)]
for a in tiles:
 for b in tiles:
  assert np.array_equal(a[:,-1],b[:,0]) and np.array_equal(a[-1],b[0])
  for sl in [np.s_[:24,:],np.s_[-24:,:],np.s_[:,:24],np.s_[:,-24:]]:assert np.array_equal(a[sl],b[sl])
atlas.save(D/'qa/ground_4x4.png',icc_profile=icc)
both=Image.new('RGB',(2048,1024));both.paste(Image.open(D/'sources/ground_before.png'),(0,0));both.paste(atlas,(1024,0));both.save(D/'qa/ground_before_after_grain.png')
(D/'qa/ground_validation.json').write_text(json.dumps({'dirt_target_luminance':target,'band_px':24,'shared_band_texture':'Mirrored periodic AI-painted dirt grain, not flat color','matching_edge_pairs':256,'matching_same_side_24px_bands':256,'tiles':stats},indent=2)+'\n')
(D/'assets.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf8');(R/'art/delivery/T002/assets.json').write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Retextured shared dirt bands; 256 seam pairs and 24px common bands verified.')




