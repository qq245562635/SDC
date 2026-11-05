from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import numpy as np,json,math
R=Path.cwd();D=R/'art/delivery/T004';m=json.loads((D/'assets.json').read_text(encoding='utf8'));A={a['file']:a for a in m['assets']}
def T(x,y):return np.array([[1.,0,x],[0,1.,y],[0,0,1.]])
def rot(a):
 a=math.radians(a);c,s=math.cos(a),math.sin(a);return np.array([[c,-s,0],[s,c,0],[0,0,1.]])
def matrices(rig,phase,mirror=False):
 a={A[f]['part']:A[f] for f in rig['parts']};foot=rig['foot_px'];root=T(foot[0]+50,foot[1]+60)
 if mirror:root=root@np.diag([-1,1,1])
 b=a['body'];body=root@T(*rig['body_rest_position'])
 out={'body':body@T(*(-np.array(b['joint_pivot'])))}
 mapping={'head':'neck','arm_l':'shoulder_l','arm_r':'shoulder_r','leg_l':'hip_l','leg_r':'hip_r'}
 for part,key in mapping.items():
  angle={'head':0,'arm_l':-phase,'arm_r':phase,'leg_l':phase*.7,'leg_r':-phase*.7}[part]
  out[part]=out['body']@T(*b['attach'][key])@rot(angle)@T(*(-np.array(a[part]['joint_pivot'])))
 if 'back' in a:out['back']=body@T(*(np.array(a['back']['rest_position'])-np.array(b['rest_position'])))@T(*(-np.array(a['back']['joint_pivot'])))
 out['weapon']=out['arm_r']@T(*a['arm_r']['hand'])@T(*(-np.array(a['weapon']['grip'])))
 return a,out
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
board=Image.new('RGB',(2080,400*len(m['rigs'])),'#e9dbc1');dr=ImageDraw.Draw(board);results=[]
for row,rig in enumerate(m['rigs']):
 maxgrip=0.;min_overlap=None
 for phase in [-20,-15,-10,0,10,15,20]:
  a,mats=matrices(rig,phase)
  hand=mats['arm_r']@np.array([*a['arm_r']['hand'],1]);grip=mats['weapon']@np.array([*a['weapon']['grip'],1])
  maxgrip=max(maxgrip,float(np.linalg.norm(hand-grip)))
 assert maxgrip<1e-8
 for col,(phase,mirror) in enumerate([(0,False),(-15,False),(15,False),(0,True)]):
  a,mats=matrices(rig,phase,mirror);frame=Image.new('RGBA',(520,400));parts={}
  for part,rec in sorted(a.items(),key=lambda kv:kv[1]['z']):
   inv=np.linalg.inv(mats[part]);coef=tuple(inv[:2,:].reshape(-1))
   im=Image.open(R/rec['file']).convert('RGBA').transform((520,400),Image.Transform.AFFINE,coef,Image.Resampling.BICUBIC)
   frame.alpha_composite(im);parts[part]=np.array(im)[:,:,3]>24
  if phase==0 and not mirror:
   ref=Image.open(R/rig['reference']).convert('RGBA')
   bodycut=frame.crop((50,60,470,360))
   # Mask metric independent of the earlier per-part reference positions.
   from scipy import ndimage as ndi
   lab,n=ndi.label(np.array(ref)[:,:,3]>24,np.ones((3,3)));sz=np.bincount(lab.ravel());sz[0]=0;refmask=lab==sz.argmax()
   got=np.array(bodycut)[:,:,3]>24
   edge=lambda z:z&~ndi.binary_erosion(z)
   e1,e2=edge(refmask),edge(got)
   err=max(ndi.distance_transform_edt(~e1)[e2].max(),ndi.distance_transform_edt(~e2)[e1].max())*.5
   assert err<=10
  board.paste(frame,(col*520,row*400),frame)
  dr.text((col*520+8,row*400+377),rig['character']+' '+('mirror' if mirror else str(phase)+' deg'),font=font,fill='#2b1d16')
 results.append({'character':rig['character'],'hierarchical_neutral_max_outline_error_display_px':float(err),'hand_grip_max_error_source_px_across_7_angles':maxgrip})
board.save(D/'qa/rig_joint_stress.png')
(D/'qa/hierarchy_validation.json').write_text(json.dumps({'samples_degrees':[-20,-15,-10,0,10,15,20],'results':results,'runtime_confirmation':'Still pending T003/T006 programmer; this renderer is only an independent art-data verification.'},indent=2)+'\n')
print(json.dumps(results))

