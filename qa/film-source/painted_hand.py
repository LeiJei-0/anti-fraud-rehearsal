"""Painted right-hand cels in a shared phone coordinate system. Offline only."""
from functools import lru_cache
from math import cos, sin, radians, pi
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ART = Path(__file__).with_name("hand-art")
SIZE = (941, 557)
BICUBIC = Image.Resampling.BICUBIC
# Glass edges extended through the rounded corners, clockwise from upper left.
OPEN_GLASS = [(195.23,88.18),(376.69,52.23),(505.80,381.12),(307.72,423.76)]
GRIP_GLASS = [(357.2,106.2),(713.1,30.6),(984.9,749.7),(616.2,835.8)]
GLASS = [(213,43),(418,0),(541,400),(342,445)]


def smooth(t, a, b):
    u = min(1, max(0, (t-a)/(b-a)))
    return u*u*(3-2*u)


def projection(source, target):
    # Pillow samples output coordinates backwards into the original image.
    rows, values = [], []
    for (u,v), (x,y) in zip(source, target):
        rows.extend([[x,y,1,0,0,0,-u*x,-u*y],
                     [0,0,0,x,y,1,-v*x,-v*y]])
        values.extend([u,v])
    return tuple(np.linalg.solve(rows, values))


def register(im, corners):
    return im.transform(SIZE, Image.Transform.PERSPECTIVE,
                        projection(corners, GLASS), BICUBIC)


def closing_hand(chapter, t, phone):
    # Approach with the open hand. Its thumb and wrist follow a rigid arc
    # into the bezel. Switch to the side view as the fingers pass behind it.
    reach=smooth(t,.12,1.18)
    curl=smooth(t,.93,1.49)
    # Align the open thumb to the actual rest contact at the bezel. The
    # hand pitches into the screen plane as it advances from the right.
    def sample(x,y):
        # The wrist stays connected to the forearm at the bottom of frame.
        # Compact the open fingers towards the edge before the palm turns.
        wrist=1-smooth(y,269,518)
        tip=smooth(y,58,178)
        reach_x=(100+37*(1-tip))*reach*wrist
        reach_y=(13+42*tip)*reach*wrist
        return x+reach_x,y+reach_y
    mesh=[]
    for y in range(0,SIZE[1],28):
        for x in range(0,SIZE[0],28):
            r,b=min(SIZE[0],x+28),min(SIZE[1],y+28)
            mesh.append(((x,y,r,b),sample(x,y)+sample(x,b)+sample(r,b)+sample(r,y)))
    opened_art=cel("reach",chapter).transform(SIZE,Image.Transform.MESH,mesh,BICUBIC)
    opened_art.alpha_composite(phone)
    if t<.93:
        return opened_art
    gripped=Image.new("RGBA",SIZE)
    offset=round(26*(1-curl))
    gripped.alpha_composite(cel("grip-palm",chapter),(offset,0))
    gripped.alpha_composite(cel("grip-fingers",chapter),(offset,0))
    gripped.alpha_composite(phone)
    gripped.alpha_composite(cel("grip-thumb",chapter),(offset//2,0))
    u=smooth(t,1.055,1.102)
    return Image.blend(opened_art.convert("RGBa"),gripped.convert("RGBa"),
                       smooth(u,.12,.89)).convert("RGBA")


def tint(im, name, chapter):
    if chapter == 2:
        return im
    # Follow the actual seam of each painted cuff. The proximity mask keeps
    # skin at the folded wrist out of the fabric treatment.
    boundaries = {"reach": [(738,557),(763,452),(797,390),(841,354),(879,344)],
                  "grip": [(1091,941),(1104,846),(1162,743),(1221,672),(1304,627)],
                  "swipe": [(621,557),(641,493),(665,445),(706,392),(747,368)]}
    kind = name.partition("-")[0]
    raw = np.asarray(im.convert("RGB"), dtype="float32")
    rgb = raw.copy()
    if chapter == 1:
        rgb = rgb * [.91,.95,.99] + [15,15,11]
    else:
        rgb = rgb * [.94,.97,.96] + [12,13,10]
    if name == "reach" or name.endswith("palm"):
        w,h = im.size
        mask = Image.new("L", im.size)
        boundary = boundaries[kind]
        ImageDraw.Draw(mask).polygon(boundary+[(w,boundary[-1][1]),(w,h)], fill=255)
        amount = np.asarray(mask.filter(ImageFilter.GaussianBlur(2)), dtype="float32")[...,None]/255
        lum = raw @ np.array([.30,.59,.11], dtype="float32")
        cloth = (np.array([182,179,159]) + lum[...,None]*.51 if chapter == 1 else
                 np.array([73,88,76]) + lum[...,None]*.55)
        rgb = rgb*(1-amount) + cloth*amount
    out = Image.fromarray(np.clip(rgb,0,255).astype("uint8"))
    out.putalpha(im.getchannel("A"))
    return out


@lru_cache(None)
def cel(name, chapter):
    if chapter == 1 and name.startswith("swipe-"):
        # Student cels were painted for this pose and share its joint positions.
        with Image.open(ART/("student-"+name.removeprefix("swipe-")+".png")) as src:
            return src.convert("RGBA")
    with Image.open(ART/(name+".png")) as src:
        im = src.convert("RGBA")
    if name != "phone-blank":
        im = tint(im, name, chapter)
    if name.startswith("grip-"):
        return register(im, GRIP_GLASS)
    if name in ("phone-blank","reach"):
        return register(im, OPEN_GLASS)
    return im


@lru_cache(None)
def screen_mask():
    mask = Image.new("L",(185,381))
    ImageDraw.Draw(mask).rounded_rectangle((0,0,184,380),radius=16,fill=255)
    return mask


def device(screen):
    phone = cel("phone-blank",2).copy()
    glass = screen.crop((17,15,202,396))
    glass.putalpha(screen_mask())
    phone.alpha_composite(register(glass,[(0,0),(184,0),(184,380),(0,380)]))
    return phone


def back_layers(chapter, name):
    back = cel(name+"-palm", chapter).copy()
    back.alpha_composite(cel(name+"-fingers", chapter))
    return back


@lru_cache(None)
def held_back(chapter, name):
    return back_layers(chapter,name)


def thumb_pose(chapter, dx, dy, press):
    # Inverse local mesh: the distal pad travels, the thenar mound remains
    # attached to the wrist. An oblique short arc bends around the thumb base.
    # Limit work to the thumb's bounding region, keeping the wrist in place.
    x0,y0,x1,y1=315,90,660,440
    src=cel("swipe-thumb",chapter)
    def sample(x,y):
        weight=min(1,max(0,(593-x)/170))**1.08
        vertical=min(1,max(0,(412-y)/85))
        w=weight*vertical
        return x-dx*w, y-dy*w+(y-213)*press*.05*w
    mesh=[]
    for top in range(y0,y1,16):
        for left in range(x0,x1,16):
            r,b=min(x1,left+16),min(y1,top+16)
            mesh.append(((left-x0,top-y0,r-x0,b-y0),
                         sample(left,top)+sample(left,b)+sample(r,b)+sample(r,top)))
    return src.transform((x1-x0,y1-y0),Image.Transform.MESH,mesh,BICUBIC),(x0,y0)


def shot_motion(chapter, mode, t):
    if mode == "orient" and chapter != 1:
        return 0,0,0,0
    if mode == "decision":
        hover=smooth(t,.46,2.14)*(1-smooth(t,2.75,4.08))
        return 36-30*hover,62+4*hover,0,0
    start=2.06 if mode=="orient" else .53
    touch=smooth(t,start,start+.53)
    swipe=smooth(t,start+.59,start+1.62)
    off=smooth(t,start+1.72,start+2.33)
    return (56*(1-touch)-14*sin(pi*swipe)+56*off,
            29+18*touch-68*swipe+22*off, touch*(1-off), swipe)


def camera(t, chapter, mode):
    pickup=mode=="orient" and chapter!=1
    lift=smooth(t,1.64,2.64) if pickup else 1
    if mode=="evidence":
        return 544,281,1.025,1.0,-2,lift
    if mode=="decision":
        return 477,283,1.04,1.0,1.6,lift
    return 465-9*lift,289-10*lift,1+.035*lift,.88+.12*lift,3-4*lift,lift


def place(im, cel_image, camera_params, offset=(0,0)):
    cx,cy,scale,fy,deg,_ = camera_params
    a=radians(deg)
    xx,xy=cos(a)/scale,sin(a)/scale
    yx,yy=-sin(a)/(scale*fy),cos(a)/(scale*fy)
    mat=(xx,xy,379-xx*cx-xy*cy-offset[0],yx,yy,235-yx*cx-yy*cy-offset[1])
    foreground=cel_image.transform(im.size,Image.Transform.AFFINE,mat,BICUBIC)
    im.paste(foreground,(0,0),foreground)


@lru_cache(maxsize=40)
def shadow(level):
    layer=Image.new("RGBA",SIZE,(44,29,25,0))
    alpha=cel("phone-blank",2).getchannel("A")
    layer.putalpha(alpha.filter(ImageFilter.GaussianBlur(2+level*.9)).point(
        lambda v: int(v*(.54-level*.021))))
    return layer


def paint(im, chapter, mode, t, make_screen):
    camera_params=camera(t,chapter,mode)
    lift=camera_params[-1]
    pickup=mode=="orient" and chapter!=1
    dx,dy,press,swipe=shot_motion(chapter,mode,t)
    screen=make_screen(chapter,mode,round(62*swipe),int(t>.52 or mode!="orient"))
    phone=device(screen)
    place(im,shadow(round(12*lift)),camera_params,(-2-10*lift,3+25*lift))
    if pickup:
        if t < 1.48:
            place(im,closing_hand(chapter,t,phone),camera_params)
            return
        rig=held_back(chapter,"grip").copy()
        rig.alpha_composite(phone)
        rig.alpha_composite(cel("grip-thumb",chapter))
    else:
        rig=held_back(chapter,"swipe").copy()
        rig.alpha_composite(phone)
        thumb,origin=thumb_pose(chapter,dx,dy,press)
        # A separated shadow at hover collapses to the pad on contact.
        gap=round(2+7*(1-press))
        shade=Image.new("RGBA",SIZE,(38,30,26,0))
        matte=Image.new("L",SIZE)
        matte.paste(thumb.getchannel("A"),(origin[0]-gap//2,origin[1]+gap))
        shade.putalpha(ImageChops.multiply(matte.filter(ImageFilter.GaussianBlur(gap/2)),
                       phone.getchannel("A")).point(lambda v:round(.36*v)))
        rig.alpha_composite(shade)
        rig.alpha_composite(thumb,origin)
    place(im,rig,camera_params)
