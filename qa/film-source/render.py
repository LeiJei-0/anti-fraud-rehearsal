"""Offline miniature cinematography. Each frame is a function of chapter, shot and seconds.
Python 3, Pillow, NumPy, fontTools, imageio-ffmpeg. Use --plates DIR with ch2-chrome.png
and ch3-chrome.png, or supply --chrome to rasterize project SVGs. Output: assets/films/.
"""
from pathlib import Path
from functools import lru_cache
from math import sin,cos,exp,pi
import argparse,random,subprocess,tempfile,concurrent.futures,os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from fontTools.pens.basePen import BasePen
from fontTools.svgLib.path import parse_path
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[2]; ART=ROOT/'assets/art'; OUT=ROOT/'assets/films'
W,H,FPS=960,540,24
M=Image.Resampling.BICUBIC
class Curve(BasePen):
 def __init__(self):super().__init__(None);self.paths=[];self.p=[]
 def _moveTo(self,p):self._endPath();self.p=[p]
 def _lineTo(self,p):self.p.append(p)
 def _curveToOne(self,b,c,d):
  a=self.p[-1]; n=max(5,min(24,int((abs(a[0]-d[0])+abs(a[1]-d[1]))*.15)+6))
  for i in range(1,n+1):
   u=i/n;v=1-u;self.p.append(tuple(v**3*a[k]+3*v*v*u*b[k]+3*v*u*u*c[k]+u**3*d[k] for k in (0,1)))
 def _qCurveToOne(self,b,c):
  a=self.p[-1];self._curveToOne(tuple((a[k]+2*b[k])/3 for k in (0,1)),tuple((c[k]+2*b[k])/3 for k in (0,1)),c)
 def _closePath(self):
  if self.p:self.p.append(self.p[0])
  self._endPath()
 def _endPath(self):
  if self.p:self.paths.append(self.p);self.p=[]
@lru_cache(None)
def lookup(d):
 p=Curve();parse_path(d,p);p._endPath();return p.paths
def path(im,d,fill=None,ink=None,w=2):
 dr=ImageDraw.Draw(im)
 for pts in lookup(d):
  if fill:dr.polygon(pts,fill=fill)
  if ink:dr.line(pts,fill=ink,width=w,joint='curve')
def lerp(a,b,u):return a+(b-a)*u
def s(t,a,b):
 u=max(0,min(1,(t-a)/(b-a)));return u*u*(3-2*u)
def rgba(size):return Image.new('RGBA',size)
def lay(im,src,center,angle=0,scale=1):
 if scale!=1:src=src.resize((max(1,round(src.width*scale)),max(1,round(src.height*scale))),M)
 if angle:src=src.rotate(angle,M,expand=True)
 im.paste(src,(round(center[0]-src.width/2),round(center[1]-src.height/2)),src)
def mix(a,b,t):return Image.blend(a,b,max(0,min(1,t))) if 0<t<1 else b if t>=1 else a
color={1:('#d8b98a','#95a995','#384a46','#b86547','#f1e5ce','#cda085'),2:('#a7806b','#8b9c96','#334752','#ce8556','#ded8c7','#bd927d'),3:('#c4b491','#8d9b87','#586b5b','#be8761','#eadfc0','#ccab91')}
@lru_cache(None)
def font(n,serif=False):return ImageFont.truetype('C:/Windows/Fonts/simkai.ttf' if serif else 'C:/Windows/Fonts/simhei.ttf',n)
def txt(d,xy,str_,n,fill,serif=False,anchor=None):d.text(xy,str_,font=font(n,serif),fill=fill,anchor=anchor)
def noise(c):
 """Watercolour on cold-press paper; coherent grain, no flicker."""
 rng=np.random.default_rng(112+c)
 small=Image.fromarray(np.uint8(np.clip(rng.normal(128,29,(29,52)),0,255))).resize((W,H),M).filter(ImageFilter.GaussianBlur(11))
 a=np.asarray(small,dtype='float32')-128
 y,x=np.mgrid[:H,:W];b=rng.normal(0,2,(H,W))
 return (a*.46+b+np.sin(y*1.36)*.9+np.cos(x*1.19)*.65).astype(np.int16)
def textured(im,c):
 a=np.asarray(im.convert('RGB')).astype(np.int16);return Image.fromarray(np.uint8(np.clip(a+grain[c][:,:,None],0,255)))
def palette(c):return color[c]
@lru_cache(None)
def table(c):
 base,sage,blue,rust,paper,skin=palette(c)
 im=Image.new('RGB',(W,H),base);d=ImageDraw.Draw(im,'RGBA'); rng=random.Random(23+c)
 for k in range(62):
  y=rng.randrange(-90,H+90); a=rng.randint(7,24);dy=rng.randrange(-19,22)
  points=[(round(x),round(y+.045*x+sin(x/150+k)*dy)) for x in np.arange(-1,W+10,7)]
  d.line(points,fill=(69,52,37,a),width=rng.choice([1,1,2,3]))
 for i in [110,400,730,1060]:
  d.polygon([(i-70,-1),(i+66,-1),(i-170,H),(i-300,H)],fill=(255,244,204,30 if c!=2 else 11))
 d.polygon([(0,482),(960,522),(960,540),(0,540)],fill=(75,54,46,15))
 if c==1:
  # Slice of a familiar cobalt notebook, cloth binding, elastic.
  a=rgba((260,310));dd=ImageDraw.Draw(a);dd.rounded_rectangle((10,6,245,300),radius=5,fill='#e6dbc2',outline='#6b6959',width=3)
  dd.rounded_rectangle((5,0,241,291),radius=5,fill='#738b85');dd.line((25,1,25,288),fill='#babba0',width=4)
  dd.rectangle((191,0,199,290),fill='#52665b');dd.rectangle((55,51,166,98),fill='#e7ddbd');txt(dd,(72,60),'笔 记',21,'#5d685c',True)
  lay(im,a,(98,47),-13)
 elif c==2:
  a=rgba((225,154));dd=ImageDraw.Draw(a)
  dd.rounded_rectangle((8,35,219,145),radius=12,fill='#464943',outline='#2c3230',width=4);dd.polygon([(15,39),(18,24),(64,22),(80,11),(135,11),(149,30),(209,30),(216,54),(11,53)],fill='#a5a18e')
  dd.rounded_rectangle((20,59,203,129),radius=8,fill='#4f5148');dd.rectangle((158,32,198,46),fill='#4b5957')
  for rr,ink in [(49,'#333b39'),(44,'#acaa9b'),(39,'#383f3d'),(30,'#7b8581'),(22,'#334447'),(13,'#273b41')]:dd.ellipse((103-rr,91-rr,103+rr,91+rr),fill=ink)
  dd.arc((85,73,119,107),185,281,fill='#bbcab8',width=3);lay(im,a,(122,69),-12)
 else:
  a=rgba((236,126));dd=ImageDraw.Draw(a);dd.rectangle((5,5,230,117),fill='#acc0a1',outline='#6a8676',width=3);dd.rectangle((13,12,222,108),outline='#788f74',width=2)
  for i in range(6):dd.ellipse((74+i*3,20+i,155-i*3,98-i),outline='#7f9b82',width=1)
  for x in [27,169]:
   for y in range(30,90,9):dd.line((x,y,x+33,y+2),fill='#879d80',width=2)
  lay(im,a,(120,94),13)
 # Porcelain cup rim, drink meniscus, handle, illumination.
 d=ImageDraw.Draw(im,'RGBA');x,y=(891,60) if c!=2 else (863,415);r=54
 d.ellipse((x-66,y-45,x+74,y+86),fill=(60,49,40,35));d.ellipse((x-65,y-61,x+65,y+62),fill=paper,outline='#878677',width=2)
 d.ellipse((x+33,y-12,x+82,y+22),outline='#bbb8a0',width=10);d.ellipse((x-r,y-r,x+r,y+r),fill='#e5daba',outline='#737c70',width=2)
 d.ellipse((x-r+8,y-r+8,x+r-8,y+r-8),fill='#a98b5f');d.arc((x-r+12,y-r+13,x+r-14,y+r-14),194,304,fill='#d4b785',width=3)
 return im
@lru_cache(None)
def hand(c):
 base,sage,blue,rust,paper,skin=palette(c); im=rgba((410,240));ink='#796455' if c!=2 else '#665750'
 path(im,'M397 129 C355 121 329 112 299 95 C270 81 254 60 228 53 C202 46 176 47 153 50 L69 57 C52 58 34 57 18 61 C6 63 5 74 18 79 C32 83 50 82 69 81 L141 82 C151 82 156 85 161 90 C147 86 136 83 126 88 C118 93 124 104 132 112 C127 108 113 105 105 114 C100 121 109 134 120 143 C111 137 100 137 97 146 C93 154 106 169 121 180 C139 192 161 195 187 195 C218 195 239 202 260 212 L331 235 L409 236 Z',skin,ink,2)
 path(im,'M270 91 C240 83 226 72 200 69 C179 65 156 66 147 69 C169 59 208 56 231 63 Z','#e3bea0')
 path(im,'M132 110 Q153 116 165 128 M120 143 Q140 150 150 160 M124 177 Q145 179 156 185 M161 89 Q189 97 203 111 M82 61 Q76 69 81 75 M93 61 Q90 66 93 71',None,ink,2)
 path(im,'M11 67 Q19 62 37 64 Q42 70 34 76 Q21 78 12 72Z','#e4c4ab','#ae8e7c',1)
 path(im,'M260 106 Q287 119 309 121 L280 210 Q250 197 231 193 Q260 175 268 143Z','#ac806b')
 cloth=['','#eceddd','#718989','#819581'][c]
 path(im,'M294 89 Q311 98 326 105 L313 130 L286 218 L267 216 Q266 154 294 89Z',paper,ink,2)
 path(im,'M318 95 Q365 112 410 117 L410 240 L278 238 Q287 171 318 95Z',cloth,blue,2)
 path(im,'M311 139 Q333 139 366 157 M295 198 Q312 187 346 191 M393 128 Q365 134 355 139',None,sage,3)
 if c==3:
  path(im,'M195 85 Q215 85 226 91 M159 69 Q172 66 184 68 M202 132 Q225 137 240 151 M174 121 Q185 117 197 119',None,'#a38070',2)
 return im
@lru_cache(maxsize=100)
def handset(c,mode,state):
 base,sage,blue,rust,paper,skin=palette(c); im=rgba((220,415));d=ImageDraw.Draw(im)
 d.rounded_rectangle((4,1,214,410),radius=32,fill='#373f40',outline='#827f72',width=3)
 d.rounded_rectangle((10,7,208,403),radius=27,fill='#1f2b2c')
 d.rounded_rectangle((17,15,201,395),radius=20,fill=blue if mode=='orient' else '#eae6d9')
 d.rounded_rectangle((86,19,135,26),radius=4,fill='#222c2c')
 d.line((211,97,211,141),fill='#acafa6',width=2);d.line((7,75,7,103),fill='#acafa6',width=2)
 if mode=='orient':
  txt(d,(109,79),['','15:12','19:42','09:16'][c],39,'#f6f0df',anchor='mm')
  if state:
   if c==2:
    d.ellipse((78,113,142,177),fill=sage);txt(d,(110,145),'岚',32,paper,True,'mm')
    txt(d,(110,202),'阿岚来电',20,paper,False,'mm')
    for x,ink in [(66,'#bb7567'),(150,'#97ac8a')]:
     d.ellipse((x-18,294,x+18,330),fill=ink);d.arc((x-11,302,x+11,322),205,335,fill=paper,width=3)
   else:
    d.rounded_rectangle((27,130,191,207),radius=12,fill='#e4e4d6')
    d.rounded_rectangle((38,144,61,167),radius=6,fill=sage);d.line((43,154,56,154),fill=paper,width=2)
    txt(d,(70,142),'信息' if c==1 else '邻里生活群',14,blue)
    txt(d,(38,177),'周末任务招募' if c==1 else '一张活动邀请',16,blue)
 elif mode=='evidence':
  txt(d,(34,59),['','任务记录','往来消息','邻里生活群'][c],21,blue)
  for i in range(3):
   y=112+i*59;d.rounded_rectangle((32,y,182,y+41),radius=7,fill='#d4dacc' if i!=1 else '#dee0d6')
   d.line((44,y+12,154-i*12,y+12),fill='#8b9b91',width=3);d.line((44,y+23,111+i*7,y+23),fill='#aab6a8',width=2)
 else:
  txt(d,(36,62),'确认之前',22,blue);d.line((35,99,182,99),fill='#b0b7a8',width=1)
  for i in range(3):
   y=125+i*33;d.line((35,y,75,y),fill='#b6bcac',width=3);d.line((101,y,176-i*11,y),fill='#8a998e',width=3)
  d.rounded_rectangle((34,250,183,291),radius=9,fill='#af7157');txt(d,(109,271),'演练确认',16,paper,False,'mm')
  d.rounded_rectangle((34,304,183,345),radius=9,outline='#a1a895',width=2);txt(d,(109,325),'再想想',15,blue,False,'mm')
 d.rounded_rectangle((80,384,138,388),radius=2,fill='#aeb2a6');return im
@lru_cache(None)
def folio(c,k):
 base,sage,blue,rust,paper,skin=palette(c);im=rgba((306,330));d=ImageDraw.Draw(im)
 if k==0: # visible dog-ear, binding, ragged pressed fibres
  path(im,'M11 4 L277 6 L299 26 L298 317 Q189 323 9 317 Z','#f0e8d6','#8f8e7c',2)
  path(im,'M277 6 L279 27 L299 26 Z','#c9bfa8','#929484',1)
 else:
  path(im,'M9 11 L295 6 L297 317 L13 321 Z','#dce3d5','#8a9384',2)
 d.rectangle((24,23,30,68),fill=rust if k==0 else sage)
 title=[('',''),('任务消息','校园就业服务'),('聊天附件','服务条款'),('活动邀请','书面说明')][c][k]
 txt(d,(43,30),title,26,blue,True);d.line((26,77,274,77),fill='#b4b4a0',width=2)
 # Hand-drawn pictorial motifs carried through the cut.
 if k==0:
  # The sender's invitation and the independently consulted record must not look identical.
  if c==1:
   d.rounded_rectangle((68,112,228,201),radius=8,fill=sage,outline=blue,width=2)
   path(im,'M72 119 L150 166 L226 118 M78 196 L127 158 M222 196 L175 158',None,paper,4)
  elif c==2:
   d.ellipse((119,100,184,167),fill=sage);path(im,'M90 207 Q102 160 151 158 Q197 158 215 203Z',sage,blue,2)
   path(im,'M95 120 Q58 147 92 180 M205 119 Q239 146 208 176',None,rust,3)
  else:
   d.ellipse((79,117,155,202),fill='#dbceb2',outline='#b6a68b',width=2);d.ellipse((148,111,218,197),fill='#e8dcbe',outline='#b6a68b',width=2)
   path(im,'M63 174 Q148 200 242 170 L219 208 Q153 227 83 208Z',sage,blue,2)
 elif c==1:
  path(im,'M62 146 L154 99 L247 146 L231 149 L231 157 L75 157 L75 149 Z',sage,blue,2)
  for x in (87,126,169,210): d.rectangle((x,160,x+9,202),fill=sage,outline=blue,width=1)
  d.rectangle((67,205,240,210),fill=blue)
 elif c==2:
  d.rounded_rectangle((67,126,235,203),radius=10,fill=sage,outline=blue,width=2)
  path(im,'M84 128 L94 113 L127 113 L136 103 L178 103 L194 126Z',paper,blue,2)
  for rr,ink in [(35,blue),(27,'#c9cfbf'),(20,'#859895'),(12,blue)]: d.ellipse((160-rr,164-rr,160+rr,164+rr),fill=ink)
  d.rectangle((81,140,104,148),fill=paper)
 else:
  path(im,'M97 203 Q92 165 123 134 Q143 143 148 164 Q155 140 185 120 Q191 171 158 202 Z',sage,blue,2)
  path(im,'M133 196 Q133 171 120 152 M149 203 Q169 160 182 135',None,blue,2)
 for i in range(3):d.line((38,236+i*17,[256,201,240][i],236+i*17),fill='#97a296',width=2)
 return im
def outline_shadow(im,a,ctr,angle,scale,alpha=.25):
 shadow=Image.new('RGBA',a.size,(34,42,37,0));shadow.putalpha(a.getchannel('A').point(lambda v:round(v*alpha)).filter(ImageFilter.GaussianBlur(3)));lay(im,shadow,(ctr[0]+6,ctr[1]+10),angle,scale);lay(im,a,ctr,angle,scale)
@lru_cache(None)
def bed():
 im=Image.new('RGB',(W,H),'#9eac98');d=ImageDraw.Draw(im,'RGBA');rng=random.Random(195)
 for k in range(-5,18):
  x=k*89
  for off,shade,wi in [(-12,(57,82,69,95),9),(0,(217,218,182,105),4),(9,(219,216,188,90),2)]:
   pts=[(int(x+off+y*.26+sin((y+k*4)/97)*10),y) for y in range(-15,H+20,4)]
   d.line(pts,fill=shade,width=wi)
 for k in range(-1,9):
  y=k*82;d.line([(x,int(y+.07*x+10*cos(x/113))) for x in range(-10,W+20,4)],fill=(213,210,172,96),width=3)
 path(im,'M0 0 L312 0 Q226 52 228 153 Q221 198 160 204 Q84 199 0 248Z','#e5d9b9','#aeb3a0',2)
 path(im,'M0 185 Q115 164 158 178 Q174 182 217 153 M0 217 Q74 191 142 189',None,'#c1b99e',3)
 path(im,'M0 464 Q156 339 323 362 Q410 371 473 420 Q393 410 309 426 Q170 449 93 540 L0 540Z','#56635b','#47584e',3)
 path(im,'M0 485 Q91 440 159 430 Q231 408 294 408 M171 466 Q232 422 291 420',None,'#778074',3)
 d=ImageDraw.Draw(im,'RGBA')
 for i in range(9):
  x=i*65-150;d.polygon([(x,0),(x+17,0),(x+255,H),(x+218,H)],fill=(250,231,171,24))
 return im

@lru_cache(None)
def spectacles():
 im=rgba((339,150));d=ImageDraw.Draw(im)
 path(im,'M33 44 Q11 52 17 82 Q22 116 55 124 Q95 135 123 109 Q143 83 124 54 Q99 29 59 35Z',None,'#6d6050',7)
 path(im,'M171 50 Q149 65 154 94 Q166 126 203 130 Q237 128 255 98 Q268 71 246 53 Q217 35 187 42Z',None,'#6d6050',7)
 path(im,'M128 63 Q138 51 157 68 M247 57 Q281 34 331 18 M29 44 Q68 17 107 11',None,'#756957',6)
 path(im,'M27 67 Q38 43 67 41 M164 76 Q178 51 205 49',None,'#e9dfc8',3)
 return im

@lru_cache(None)
def loose(c):
 im=rgba((260,206));d=ImageDraw.Draw(im);base,sage,blue,rust,paper,skin=palette(c)
 if c==1:
  path(im,'M17 0 Q67 78 126 93 M51 0 Q115 64 145 86',None,'#6d8d86',10)
  d.rounded_rectangle((54,77,221,188),radius=8,fill='#e9e4d3',outline=blue,width=3)
  d.rectangle((61,85,215,104),fill=sage);d.ellipse((80,119,103,143),fill=sage)
  path(im,'M67 168 Q84 132 105 144 Q113 145 121 168Z',sage)
  txt(d,(130,123),'校园卡',17,blue,True);d.line((132,153,201,153),fill=sage,width=3)
 elif c==2:
  # Printed photo removed from an envelope, folded corner catches the light.
  path(im,'M5 25 L241 7 L254 181 L20 201 Z','#eee9d9','#867e70',2)
  path(im,'M17 39 L228 23 L238 154 L29 170 Z',sage)
  path(im,'M20 122 L91 68 L144 105 L181 65 L237 121 L238 154 L29 171 Z',blue)
  path(im,'M57 166 Q109 116 159 117 Q186 117 215 129 Q154 131 128 160Z','#b8bd9e')
  d.ellipse((173,46,192,65),fill='#e1cd9f');txt(d,(147,164),'那年秋天',13,blue,True)
 else:
  path(im,'M19 21 Q114 27 240 12 L247 178 Q115 190 26 178 Z','#b7c5a1','#7e8e74',2)
  d.rectangle((38,39,224,161),outline='#879a7e',width=3)
  for k in range(6):d.ellipse((101+k*3,58+k*2,169-k*3,143-k*2),outline='#81967e',width=2)
  for y in [56,69,127,143]:d.line((47,y,82,y),fill='#879a7e',width=2);d.line((183,y,216,y),fill='#879a7e',width=2)
 return im
def scene(c,mode,t):
 base,sage,blue,rust,paper,skin=palette(c);im=(bed() if c==1 and mode!='evidence' else table(c)).copy();d=ImageDraw.Draw(im,'RGBA')
 if mode=='orient':
  # Staggered kinetic events: screen wakes; the cup pauses; a hand reaches.
  vibr=(sin(44*t)*3*(1-s(t,2.2,2.85))) if t>1.45 else 0
  x,y=516+vibr,276+sin(t)*1.8;angle=-9+sin(t*1.1)*.45
  p=handset(c,'orient',int(t>=1.45));outline_shadow(im,p,(x,y),angle,.97)
  if c==3:
   lift=s(t,.8,2.0)
   lay(im,spectacles(),(500+lift*203,248-lift*144),-9-17*lift,.83)
  elif c==1:
   # The palm remains on the duvet; the illuminated screen is the same phone in-hand.
   lay(im,loose(1),(115,62),8,.64)
  elif c==2:
   lay(im,loose(2),(173,435),9,.79)
  if 1.45<t<2.35:
   for k in [0,.16]:
    z=min(1,max(0,(t-1.45-k)/.69));r=20+18*z
    d.arc((x+113-r,y-96-r,x+113+r,y-96+r),284,57,fill=(244,231,197,int(170*(1-z))),width=2)
  motion=s(t,2.2,3.9); hx=lerp(1180,800,motion);hy=lerp(498,348,motion)-6*sin(motion*pi)
  lay(im,hand(c),(hx,hy),-15+12*motion,.95)
 elif mode=='evidence':
  # Two pieces of paper do not simply fade in: the nearer one slides across the table;
  # index finger aligns the records, then follows a single line.
  outline_shadow(im,handset(c,'evidence',1),(139,359),17,.68)
  outline_shadow(im,folio(c,0),(388,252),7,.95)
  # The nearer person introduces a physical source independent from the on-screen message.
  reveal=s(t,.2,1.5)
  where={1:((178,4),(250,119),4),2:((25,53),(225,115),15),3:((280,5),(285,128),-10)}[c]
  (x0,y0),(x1,y1),a=where; lay(im,loose(c),(lerp(x0,x1,reveal),lerp(y0,y1,reveal)),a+6*reveal,.76)
  turn=s(t,.65,2.28); x=lerp(977,631,turn); y=lerp(388,289,turn)
  outline_shadow(im,folio(c,1),(x,y),lerp(-21,-4,turn),.91)
  handIn=s(t,0,1.05);slide=s(t,2.45,4.2);rest=s(t,4.4,5.8)
  lay(im,hand(c),(x+lerp(307,199,handIn)+48*slide+65*rest,y+lerp(136,109,handIn)+31*slide+40*rest),-13+8*slide,.88)
 else:
  # Close insert: finger approaches button, visibly holds a gap, then retreats. No tap.
  outline_shadow(im,folio(c,0),(134,161),12,.70)
  x=499;y=263;outline_shadow(im,handset(c,'decision',1),(x,y),-6,1.15)
  z=s(t,.10,2.0);rest=s(t,3.05,4.72)
  hx=lerp(1011,728,z)+166*rest;hy=lerp(476,370,z)+57*rest
  lay(im,hand(c),(hx,hy),-7+4*z-5*rest,1.08)
 # Steam coasts between cuts; line geometry changes from moment to moment.
 d=ImageDraw.Draw(im,'RGBA');bx,by=(891,60) if c!=2 else (863,415)
 for k in range(2):
  if c==1 and mode!='evidence':continue
  pts=[];phase=(t*.28+k*.47)%1
  for j in range(24):
   v=j/23;pts.append((int(bx+sin(v*4+t+k*2)*6+10*k),int(by-6-47*v-19*phase)))
  d.line(pts,fill=(251,240,209,round(65*sin(pi*phase))),width=2)
 return im
def crop(img,center,scale):
 iw,ih=img.size;ww=min(iw,ih*W/H)/scale;hh=ww*H/W
 x=max(0,min(iw-ww,center[0]*iw-ww/2));y=max(0,min(ih-hh,center[1]*ih-hh/2))
 return img.transform((W,H),Image.Transform.EXTENT,(x,y,x+ww,y+hh),M)
def acting_plate(c,t):
 # A low-frequency, local mesh: slight neck rotation toward the ringing phone,
 # then a delayed shoulder/forearm shift. Architecture is outside the masks.
 src=plates[c];w,h=src.size
 head=[None,(.82,.14),(.586,.248),(.604,.245)][c]
 arm=[None,(.755,.255),(.659,.65),(.665,.649)][c]
 a=s(t,.40,1.64); release=s(t,2.,3.0)
 ox=3.3*sin(t*2.2)+3*a; oy=3.3*a+1.45*sin(t*2.6)
 ax=3.5*a+2.2*sin(t*2.5);ay=1.3*cos(t*2.5)-1.7*a
 def sample(x,y):
  nx=x/w;ny=y/h
  u=exp(-(((nx-head[0])/.093)**2+((ny-head[1])/.14)**2)*1.8)
  v=exp(-(((nx-arm[0])/.074)**2+((ny-arm[1])/.086)**2)*1.9)
  return (x-u*ox-v*ax,y-u*oy-v*ay)
 mesh=[]
 for j in range(10):
  for i in range(16):
   l,r=round(i*w/16),round((i+1)*w/16);u,b=round(j*h/10),round((j+1)*h/10)
   mesh.append(((l,u,r,b),sample(l,u)+sample(l,b)+sample(r,b)+sample(r,u)))
 return src.transform(src.size,Image.Transform.MESH,mesh,Image.Resampling.BILINEAR)
def room(c,t,close=False):
 center=[(0,0),(.775,.26),(.59,.38),(.61,.38)][c]
 scale=(1.6 if close else 1)+s(t,0,3)*(.16 if close else .08)
 im=crop(acting_plate(c,t),center,scale)
 if not close:
  overlay=rgba((W,H));d=ImageDraw.Draw(overlay)
  for i in range(10):
   x=(i*59.5+13+2.1*t)%430; y=34+(i*41+3*sin(t+i))%330;r=1 if i%4 else 1.8
   d.ellipse((x-r,y-r,x+r,y+r),fill=(250,236,192,26+int(12*sin(t+i))))
  im.paste(overlay,(0,0),overlay)
 return im
def frame(c,mode,t):
 if mode=='orient':
  wide=room(c,t) if t<2.70 else None
  if t<2.30:im=wide
  elif t<2.70:im=mix(wide,scene(c,mode,t-2.3),s(t,2.3,2.70))
  else:im=scene(c,mode,t-2.3)
 elif mode=='evidence':
  im=scene(c,mode,t)
  # Decision context must remain visually available, preserve the comparison as the final hold.
  if t<.55:im=mix(room(c,t,True),im,s(t,.12,.55))
 else:
  im=scene(c,mode,t)
  if t>4.7:im=mix(im,room(c,max(0,t-4.7),True),s(t,4.7,5.17))
 if mode!='orient' and (mode=='evidence' or t<4.7):im=crop(im,(.54,.54),1.0+.025*s(t,0,5))
 return textured(im,c)
def prepare(args):
 global grain,plates
 grain={c:noise(c) for c in (1,2,3)}
 plates={1:Image.open(ART/'ch1.webp').convert('RGB')}
 for c in (2,3):
  fn=(args.plates/f'ch{c}-chrome.png') if args.plates else Path(tempfile.gettempdir())/f'painted-plate-{c}.png'
  if not args.plates:
   subprocess.run([args.chrome,'--headless','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1','--window-size=1440,810','--user-data-dir='+tempfile.mkdtemp(),'--screenshot='+str(fn),(ART/f'ch{c}.svg').as_uri()],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  plates[c]=Image.open(fn).convert('RGB')
def encode(item):
 c,mode=item;dur={'orient':7.25,'evidence':6,'decision':6}[mode];target=OUT/f'{c}-{mode}.mp4';N=round(dur*FPS)
 ff=imageio_ffmpeg.get_ffmpeg_exe();cmd=[ff,'-loglevel','error','-y','-f','rawvideo','-s',f'{W}x{H}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for i in range(N):proc.stdin.write(frame(c,mode,i/FPS).tobytes())
 proc.stdin.close()
 if proc.wait():raise RuntimeError(target)
 print(target.name,N,'frames',target.stat().st_size,'bytes',flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--plates',type=Path);parser.add_argument('--chrome',default='C:/Program Files/Google/Chrome/Application/chrome.exe');parser.add_argument('--sheets',type=Path);parser.add_argument('--preview-only',action='store_true');args=parser.parse_args()
 prepare(args);items=[(c,m) for c in (1,2,3) for m in ('orient','evidence','decision')];OUT.mkdir(exist_ok=True,parents=True)
 if args.sheets:
  args.sheets.mkdir(exist_ok=True,parents=True)
  for c in (1,2,3):
   sheet=Image.new('RGB',(960,405))
   for j,mode in enumerate(('orient','evidence','decision')):
    for i,t in enumerate((.15,2.55,4.35,6.28 if mode=='orient' else 5.65)):
     sheet.paste(frame(c,mode,t).resize((240,135),Image.Resampling.LANCZOS),(i*240,j*135))
   sheet.save(args.sheets/f'ch{c}-strip.jpg',quality=90)
 if not args.preview_only:
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(encode,items))
