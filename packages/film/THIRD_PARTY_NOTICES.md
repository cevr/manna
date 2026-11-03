# Third-party notices

Code in `@manna/film` ported from other projects, with the notices their licences ask a copy to keep.

## pixelfx

`src/canvas/particles.ts` is ported from pixelfx's `particles.js` (https://github.com/patch-gg/pixelfx), on the film's own seeded `rng` and `hash2`. Its licence:

```
MIT License. Copyright (c) 2026 Patch. Copyright (c) 2026 Hugo Duprez.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## fdlibm

The polynomials and the reductions in `src/core/synth/graph/math.ts` are fdlibm's (k_sin.c, k_cos.c, e_exp.c, e_log.c, s_tanh.c):

```
Copyright (C) 1993 by Sun Microsystems, Inc. All rights
reserved. Developed at SunPro, a Sun Microsystems, Inc. business. Permission
to use, copy, modify, and distribute this software is freely granted,
provided that this notice is preserved.
```
