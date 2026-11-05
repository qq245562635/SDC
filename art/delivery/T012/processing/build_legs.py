from pathlib import Path
from PIL import Image,ImageCms
import numpy as np,json,math,hashlib,subprocess
R=Path.cwd();D=R/'art/delivery/T012';ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
M=R/'art/delivery/T004/assets.json';L=R/'art/delivery/T002/assets.json'
m=json.loads(M.read_text(encoding='utf8'));old=json.loads(L.read_text(encoding='utf8'));by={a['file']:a for a in old['assets']}
baseline=json.loads(subprocess.run(['git','show','1d7880d:art/delivery/T004/assets.json'],capture_output=True,check=True).stdout)
base={a['file']:a for a in baseline['assets']}
results=[];newrecords=[]
def axis(im,p):
 a=np.array(im)[:,:,3]>128;y,x=np.where(a);d=np.hypot(x-p[0],y-p[1]);pick=d>=d.max()*.85
 dx=float(x[pick].mean()-p[0]);dy=float(y[pick].mean()-p[1])
 return math.degrees(math.atan2(dx,dy)),math.hypot(dx,dy)
for a in m['assets']:
 if a.get('part') not in ['leg_l','leg_r']:continue
 c=a['character'];kind='soldier_blue' if c.startswith('soldier') else c;part=a['part'];near=part=='leg_r';original=base[a['file']]
 src=D/f'sources/{kind}_{part}_crop.png';im=Image.open(src).convert('RGBA')
 width={'hero':36,'soldier_blue':40,'archer':32}[kind]-(0 if near else 1)
 W,H=a['size_px'];px,py=a['joint_pivot'];h=H-8
 im=im.resize((width,h),Image.Resampling.LANCZOS)
 ar=np.array(im)[:,:,3]>128;y,x=np.where(ar);fx=float(x[y>h*.86].mean())
 initial=px-fx;top=4.;best=None
 # Translation only: no pre-rotated stride, no slanted sole.
 for left in np.linspace(initial-3,initial+3,301):
  candidate=im.transform((W,H),Image.Transform.AFFINE,(1,0,-float(left),0,1,-top),Image.Resampling.BICUBIC)
  box=candidate.getbbox()
  if not box or min(box[:2])<1 or box[2]>=W or box[3]>=H:continue
  ang,ln=axis(candidate,(px,py));score=abs(ang)
  if best is None or score<best[0]:best=(score,candidate,float(left),ang,ln)
 assert best is not None,a['file']
 err,out,left,ang,ln=best;assert err<.5,(a['file'],ang)
 assert out.getpixel((round(px),round(py)))[3]>128,(a['file'],'pivot outside material')
 p=R/a['file'];out.save(p,optimize=True,icc_profile=ICC)
 mask=np.array(out)[:,:,3]>128;ys,xs=np.where(mask)
 foot=ys>H*.8;xx=xs[foot];lo,hi=np.quantile(xx,[.2,.8]);bottom=[]
 for x0 in range(math.ceil(lo),math.floor(hi)+1):
  col=np.where(mask[:,x0])[0]
  if len(col):bottom.append(int(col.max()))
 flat=max(bottom)-min(bottom);assert flat<=1,(a['file'],flat)
 a.update(content_bbox=list(out.getbbox()),source=src.relative_to(R).as_posix(),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),method='T012 matched trousers and boots; neutral vertical leg, horizontal sole; resampled into unchanged canvas and translated around unchanged hip pivot. No baked stride rotation.')
 for stale in ['source_rect','reference_rect','visible_source']:a.pop(stale,None)
 for k in ['size_px','display_scale','joint_pivot','origin_normalized','rest_position','z','part','character']:
  assert a[k]==original[k],(a['file'],k)
 by[a['file']].update(a)
 for stale in ['source_rect','reference_rect','visible_source']:by[a['file']].pop(stale,None)
 newrecords.append(a.copy())
 # Original vertical envelope is preserved; the old oblique radial length is diagnostic only.
 rawbytes=subprocess.run(['git','show','1d7880d:'+a['file']],capture_output=True,check=True).stdout
 import io
 oldim=Image.open(io.BytesIO(rawbytes)).convert('RGBA');oldang,oldln=axis(oldim,(px,py))
 results.append({'file':a['file'],'old_axis_degrees':round(oldang,4),'new_axis_degrees':round(ang,4),'old_oblique_radial_length_source_px':round(oldln,4),'new_radial_length_source_px':round(ln,4),'old_canvas_size':list(oldim.size),'new_canvas_size':list(out.size),'visible_leg_width_px':width,'hip_pivot_unchanged':True,'z_unchanged':True,'sole_core_height_range_source_px':flat,'registration':{'left':left,'top':top,'resized_size':[width,h]}})
M.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf8');L.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
manifest={'task':'T012','base_commit':'1d7880d6588cc0b3a1292d3d433b958f4e207c63','units':'Source PNG pixels; display_scale remains 0.5','notes':['Replacement records also written to canonical T004 and legacy T002 manifests; no importer changes needed.','Original PNG canvas, hip joint_pivot, origin_normalized, rest_position and z are unchanged.','Legs are repainted upright inside the original vertical envelope; oblique stride extension is intentionally removed, not rotated into a longer hanging leg.','Faction-colored soldier tunics share the same neutral cream trousers and brown boots, as before.'],'assets':newrecords}
(D/'assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(D/'validation.json').write_text(json.dumps({'task':'T012','measure':'Existing sync_art.leg_axis alpha>128 farthest 15% estimator, source pixel units','width_note':'Visible leg width is fitted as a matching pair; canvas and vertical extent are held constant. Old stride silhouette width is not a straight-leg width.','results':results,'runtime_confirmation':'Pending programmer rig.html walk/run check.'},indent=2)+'\n')
print(json.dumps(results,indent=2))
