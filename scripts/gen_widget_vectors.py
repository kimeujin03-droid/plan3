"""모아 위젯용 벡터 그림을 만든다. 앱의 SVG(Moa.tsx)와 같은 좌표(200×214)를 쓴다."""
import math, os, sys
out = sys.argv[1]
W, H = 200, 214

def rrect(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    return (f"M{x+r},{y} L{x+w-r},{y} A{r},{r} 0 0 1 {x+w},{y+r} L{x+w},{y+h-r} A{r},{r} 0 0 1 {x+w-r},{y+h} "
            f"L{x+r},{y+h} A{r},{r} 0 0 1 {x},{y+h-r} L{x},{y+r} A{r},{r} 0 0 1 {x+r},{y} Z")

def ellipse(cx, cy, rx, ry):
    return f"M{cx-rx},{cy} A{rx},{ry} 0 1 0 {cx+rx},{cy} A{rx},{ry} 0 1 0 {cx-rx},{cy} Z"

def circle(cx, cy, r):
    return ellipse(cx, cy, r, r)

def path(d, fill=None, stroke=None, sw=None, alpha=None, cap='round', join='round'):
    a = [f'android:pathData="{d}"']
    if fill: a.append(f'android:fillColor="{fill}"')
    if stroke:
        a += [f'android:strokeColor="{stroke}"', f'android:strokeWidth="{sw}"', f'android:strokeLineCap="{cap}"', f'android:strokeLineJoin="{join}"']
    if alpha is not None: a.append(f'android:strokeAlpha="{alpha}"')
    return '<path ' + ' '.join(a) + ' />'

def vector(name, body):
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<!-- 생성됨: scripts/gen_widget_vectors.py. 모아 위젯 그림 한 겹. -->\n'
           f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="{W}dp" android:height="{H}dp" '
           f'android:viewportWidth="{W}" android:viewportHeight="{H}">\n  ' + '\n  '.join(body) + '\n</vector>\n')
    open(os.path.join(out, name + '.xml'), 'w').write(xml)

EYE = '#F7F3FF'
vector('moa_body', [
    path('M38,44 L46,8 Q49,2 55,7 L84,30 Z', '#CFC6F3'),
    path('M162,44 L154,8 Q151,2 145,7 L116,30 Z', '#CFC6F3'),
    path('M49,34 L52,16 L67,30 Z', '#E7E0FB'),
    path('M151,34 L148,16 L133,30 Z', '#E7E0FB'),
    path(rrect(14, 30, 172, 140, 62), '#B3A7E6'),
    path(rrect(14, 22, 172, 140, 62), '#CFC6F3'),
    path(rrect(32, 46, 136, 96, 42), '#17132A'),
])
vector('moa_eyes_idle', [path(rrect(64, 80, 16, 28, 8), EYE), path(rrect(120, 80, 16, 28, 8), EYE),
                         path('M54,116 L57,111 M60,116 L63,111 M137,116 L140,111 M143,116 L146,111', stroke=EYE, sw=2.5, alpha=0.7)])
vector('moa_eyes_focus', [path(rrect(61, 91, 22, 6, 3), EYE), path(rrect(117, 91, 22, 6, 3), EYE)])
vector('moa_eyes_sleep', [path(rrect(62, 100, 20, 5, 2.5), EYE), path(rrect(118, 100, 20, 5, 2.5), EYE)])

def rot(px, py, deg, ox=0, oy=0):
    t = math.radians(deg)
    return (ox + px * math.cos(t) - py * math.sin(t), oy + px * math.sin(t) + py * math.cos(t))

# 리본: translate(148 30) rotate(18)
def ribbon_wing(sign):
    pts = [(0, 0), (22 * sign, -13), (26 * sign, 0), (22 * sign, 13)]
    p = [rot(x, y, 18, 148, 30) for x, y in pts]
    f = lambda q: f"{q[0]:.1f},{q[1]:.1f}"
    return f"M{f(p[0])} L{f(p[1])} Q{f(p[2])} {f(p[3])} Z"
knot = rot(0, 0, 18, 148, 30)
vector('acc_ribbon', [path(ribbon_wing(-1), '#FF9EC4', '#E57AA5', 2), path(ribbon_wing(1), '#FF9EC4', '#E57AA5', 2), path(circle(knot[0], knot[1], 6), '#FFB8D6', '#E57AA5', 2)])
vector('acc_hat', [path(ellipse(100, 27, 44, 12), '#7FA8F0'), path('M70,27 Q72,2 100,2 Q128,2 130,27 Z', '#9CBCF7'), path(circle(100, 2, 6), '#FFD45C'),
                   path('M72,22 Q100,30 128,22', stroke='#FFFFFF', sw=4, alpha=0.7)])
vector('acc_headphones', [path('M24,96 Q24,4 100,4 Q176,4 176,96', stroke='#6E64A8', sw=9), path(rrect(4, 72, 26, 46, 12), '#FF8FA8', '#6E64A8', 4), path(rrect(170, 72, 26, 46, 12), '#FF8FA8', '#6E64A8', 4)])
vector('acc_glasses', [path(rrect(50, 74, 44, 40, 16), stroke='#FFD45C', sw=4), path(rrect(106, 74, 44, 40, 16), stroke='#FFD45C', sw=4), path('M94,90 Q100,85 106,90', stroke='#FFD45C', sw=4)])
petals = []
for r in [0, 72, 144, 216, 288]:
    # 꽃잎: (0,-10) 중심 타원을 r도 돌린 것 → 중심을 돌리고 타원도 돌려야 하지만, 둥근 꽃잎이라 원에 가깝게 근사
    cx, cy = rot(0, -10, r, 52, 30)
    petals.append(path(ellipse(cx, cy, 8, 8), '#FFF2A8', '#F2C94C', 1.5))
vector('acc_flower', petals + [path(circle(52, 30, 6), '#FF9F68')])
vector('board_skate', [path('M12,172 Q14,182 26,182 L174,182 Q186,182 188,172', '#FF8FA8', '#E5707F', 3),
                       path(circle(50, 194, 9), '#26233A'), path(circle(150, 194, 9), '#26233A'),
                       path(circle(50, 194, 3), '#FFD45C'), path(circle(150, 194, 3), '#FFD45C')])
print('ok')
