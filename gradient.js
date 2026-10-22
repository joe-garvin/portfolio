/* joegarvin.com background gradient. One file, no libraries. Add to every page: <script src="/gradient.js" defer></script>
   Joe's picks from the gradient site study (October 20, 2026): cold room palette with the darkest color lifted, mesh shape, seed 7,
   scale 1.1, warp 0.36, softness 0.89, grain 0.49, 10 second seamless loop, 60 frame cap, paper veil 0.55 on every page,
   page grain overlay 0.86, same motion on home, shared timeline across pages, no plate under the home square. */
(function () {
  'use strict';
  var CFG = {
    palette: ['#2b5f8a', '#5fa8b5', '#9cc5a1', '#e4d8a8', '#76829f'], // cold room, darkest color lifted (was slate #3d4257)
    seed: 7, scale: 1.1, warp: 0.36, soft: 0.89, grain: 0.49,
    period: 10,          // seconds for one seamless loop
    veil: 0.55,          // white paper laid over the gradient, every page
    pageGrain: 0.86,     // opacity of the site's four grain layers
    homeRate: 1,         // 1 = same speed on home. 0.35 = slower, 0 = still
    fps: 60,
    maxPixels: 3e6,      // render size cap; a very large display renders smaller and is stretched
    touchScale: 0.5,     // phones and tablets render at half size
    inkLabels: false     // true turns the soft grey mono labels to the full ink color (they fail contrast over the gradient)
  };

  var d = document, TAU = Math.PI * 2;
  var isHome = !!d.getElementById('doc') && !!d.getElementById('dz');
  var rate = isHome ? CFG.homeRate : 1;
  var rm = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- elements and styles ---- */
  var st = d.createElement('style');
  st.textContent =
    '#jg-bg,#jg-veil{position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none}' +
    '#jg-veil{background:#fff;opacity:' + CFG.veil + '}' +
    '@media (min-width:720px){.grain{opacity:' + CFG.pageGrain + '}}' +
    (CFG.inkLabels ? ':root{--soft:#3d4257}' : '');
  d.head.appendChild(st);
  var cv = d.createElement('canvas');
  cv.id = 'jg-bg'; cv.setAttribute('aria-hidden', 'true');
  var veil = d.createElement('div');
  veil.id = 'jg-veil'; veil.setAttribute('aria-hidden', 'true');
  d.body.insertBefore(veil, d.body.firstChild);
  d.body.insertBefore(cv, d.body.firstChild);

  /* ---- no WebGL2: a still CSS gradient from the same palette ---- */
  var gl = null;
  try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) {}
  function fallback() {
    var f = d.createElement('div');
    f.id = 'jg-bg'; f.setAttribute('aria-hidden', 'true');
    f.style.background = 'linear-gradient(120deg,' + CFG.palette.map(function (c, i) { return c + ' ' + i * 25 + '%'; }).join(',') + ')';
    cv.replaceWith(f);
  }
  if (!gl) { fallback(); return; }

  /* ---- the shader: a few color points drifting and blended, with a noise warp. Every noise lookup walks a circle, so one period loops exactly. ---- */
  var VS = '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}';
  var FS = [
    '#version 300 es', 'precision highp float;',
    'uniform vec2 uRes;uniform float uA;uniform vec2 uSeed;uniform vec3 uPal[5];uniform float uFrame;',
    'const float SC=' + CFG.scale.toFixed(3) + ',WARP=' + CFG.warp.toFixed(3) + ',SOFT=' + CFG.soft.toFixed(3) + ',GRAIN=' + CFG.grain.toFixed(3) + ';',
    'out vec4 oc;',
    'float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}',
    'vec2 orb(float ph,float r){float a=uA+ph;return r*vec2(cos(a),sin(a));}',
    'float fbm(vec2 p,float ph){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p+orb(ph+float(i)*1.9,.7));p=p*2.03+vec2(17.1,3.7);a*=.5;}return s/.9375;}',
    'void main(){',
    ' vec2 fr=gl_FragCoord.xy;vec2 uv=(fr-.5*uRes)/(.5*uRes.y);',
    ' vec2 p=uv*SC*1.4+uSeed;',
    ' vec2 u=uv*SC*.9+(vec2(fbm(p,0.),fbm(p+3.3,1.))-.5)*WARP*.8;',
    ' vec3 acc=vec3(0.);float ws=0.;float ex=mix(5.,1.6,SOFT);',
    ' for(int i=0;i<5;i++){float fi=float(i);',
    '  vec2 b=vec2(h21(vec2(fi,uSeed.x))*2.-1.,h21(vec2(fi+9.,uSeed.y))*2.-1.)*vec2(1.5,.95);',
    '  vec2 c=b+orb(fi*1.3,.28+.06*fi);float d=length(u-c);float w=1./pow(d*d+.03,ex);acc+=w*uPal[i];ws+=w;}',
    ' vec3 col=acc/ws;',
    ' float g1=h21(fr+vec2(fract(uFrame*.173)*97.,fract(uFrame*.291)*57.))-.5;',
    ' float g2=h21(floor(fr*.5)+vec2(fract(uFrame*.11)*31.,7.))-.5;',
    ' col+=(g1*.6+g2*.5)*GRAIN*.28;',
    ' oc=vec4(clamp(col,0.,1.),1.);',
    '}'
  ].join('\n');
  function sh(t, src) {
    var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var U = {};
  try {
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    ['uRes', 'uA', 'uSeed', 'uPal', 'uFrame'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    gl.bindVertexArray(gl.createVertexArray());
  } catch (e) { fallback(); return; }

  var pal = new Float32Array(15);
  CFG.palette.forEach(function (h, i) {
    var n = parseInt(h.slice(1), 16);
    pal[i * 3] = (n >> 16 & 255) / 255; pal[i * 3 + 1] = (n >> 8 & 255) / 255; pal[i * 3 + 2] = (n & 255) / 255;
  });
  var s = CFG.seed;
  var seed = [((Math.sin(s * 12.9898) * 43758.5453) % 1 + 1) % 1 * 40, ((Math.sin(s * 78.233) * 12345.678) % 1 + 1) % 1 * 40];

  /* ---- timeline: position in the loop is saved when you leave a page and picked up on the next, so it never restarts ---- */
  var KEY = 'jg.bg', P = 0, frame = 0, last = 0, raf = 0;
  try { var v = parseFloat(sessionStorage.getItem(KEY)); if (isFinite(v)) P = ((v % 1) + 1) % 1; } catch (e) {}
  function save() { try { sessionStorage.setItem(KEY, String(P)); } catch (e) {} }

  function draw() {
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform1f(U.uA, (rm.matches ? 0.25 : P) * TAU);
    gl.uniform2f(U.uSeed, seed[0], seed[1]);
    gl.uniform3fv(U.uPal, pal);
    gl.uniform1f(U.uFrame, frame);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function size() {
    var coarse = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
    var dpr = Math.min(devicePixelRatio || 1, 2) * (coarse ? CFG.touchScale : 1);
    var w = innerWidth * dpr, h = innerHeight * dpr, k = Math.min(1, Math.sqrt(CFG.maxPixels / (w * h)));
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    update();
  }
  function moving() { return !(rm.matches || d.hidden || rate === 0); }
  function tick(now) {
    raf = 0; if (!moving()) return;
    if (last && now - last < 1000 / CFG.fps - 2) { raf = requestAnimationFrame(tick); return; }
    var dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
    P = (P + dt * rate / CFG.period) % 1; frame++;
    if (frame % 120 === 0) save();
    draw(); raf = requestAnimationFrame(tick);
  }
  function update() {
    if (moving()) { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
    else { cancelAnimationFrame(raf); raf = 0; frame++; draw(); }
  }
  d.addEventListener('visibilitychange', function () { last = 0; save(); update(); });
  addEventListener('pagehide', save);
  addEventListener('resize', size);
  if (rm.addEventListener) rm.addEventListener('change', update);
  size();
})();
