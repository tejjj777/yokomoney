/* YOKO! Student · Offline QR Code Generator (Pure JS, zero dependencies).
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/**
 * Compact, self-contained QR Code generator for UPI payment links and URLs.
 * Produces an SVG string.
 */
const QRCode = (() => {
  // GF(256) math tables
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function gfMul(x, y) {
    return (x === 0 || y === 0) ? 0 : EXP[LOG[x] + LOG[y]];
  }

  function rsGenPoly(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        next[j] ^= gfMul(p[j], EXP[i]);
        next[j + 1] ^= p[j];
      }
      p = next;
    }
    return p;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenPoly(ecLen);
    const res = new Uint8Array(data.length + ecLen);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version specs: [dataBytes, ecBytes, versionNumber, sideLength]
  const VERSIONS = [
    [19, 7, 1, 21],
    [34, 10, 2, 25],
    [55, 15, 3, 29],
    [80, 20, 4, 33],
    [108, 26, 5, 37],
    [136, 36, 6, 41],
    [156, 40, 7, 45],
    [194, 48, 8, 49],
    [232, 60, 9, 53],
    [274, 72, 10, 57]
  ];

  const ALIGNMENT_PATTERN_POS = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50]
  ];

  function createMatrix(version, size) {
    const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const isReserved = Array.from({ length: size }, () => new Uint8Array(size).fill(0));

    function setPattern(r, c, w, h, val, isRes = 1) {
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          if (r + i < size && c + j < size) {
            matrix[r + i][c + j] = typeof val === 'function' ? val(i, j) : val;
            isReserved[r + i][c + j] = isRes;
          }
        }
      }
    }

    // Finder patterns
    function finder(r, c) {
      setPattern(r, c, 7, 7, (i, j) => {
        if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) return 1;
        return 0;
      });
      // Separator
      for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
          if (i === -1 || i === 7 || j === -1 || j === 7) {
            if (r + i >= 0 && r + i < size && c + j >= 0 && c + j < size) {
              matrix[r + i][c + j] = 0;
              isReserved[r + i][c + j] = 1;
            }
          }
        }
      }
    }

    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!isReserved[6][i]) { matrix[6][i] = (i % 2 === 0 ? 1 : 0); isReserved[6][i] = 1; }
      if (!isReserved[i][6]) { matrix[i][6] = (i % 2 === 0 ? 1 : 0); isReserved[i][6] = 1; }
    }

    // Alignment patterns for version >= 2
    const align = ALIGNMENT_PATTERN_POS[version] || [];
    for (let i = 0; i < align.length; i++) {
      for (let j = 0; j < align.length; j++) {
        const r = align[i], c = align[j];
        if (isReserved[r][c]) continue;
        setPattern(r - 2, c - 2, 5, 5, (y, x) => {
          if (y === 0 || y === 4 || x === 0 || x === 4 || (y === 2 && x === 2)) return 1;
          return 0;
        });
      }
    }

    // Dark module
    matrix[4 * version + 9][8] = 1;
    isReserved[4 * version + 9][8] = 1;

    // Reserve format info area
    for (let i = 0; i < 9; i++) {
      if (i < size) { isReserved[8][i] = 1; isReserved[i][8] = 1; }
    }
    for (let i = size - 8; i < size; i++) {
      if (i >= 0) { isReserved[8][i] = 1; isReserved[i][8] = 1; }
    }

    return { matrix, isReserved, size };
  }

  function encodeData(text) {
    const utf8 = new TextEncoder().encode(text);
    let vSpec = null;
    for (let i = 0; i < VERSIONS.length; i++) {
      if (VERSIONS[i][0] >= utf8.length + 3) {
        vSpec = VERSIONS[i];
        break;
      }
    }
    if (!vSpec) vSpec = VERSIONS[VERSIONS.length - 1];

    const [maxData, ecLen, version, size] = vSpec;
    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    }

    // Byte mode: 0100
    pushBits(4, 4);
    // Character count indicator (8 bits for version 1-9)
    pushBits(utf8.length, version < 10 ? 8 : 16);
    // Data
    for (let i = 0; i < utf8.length; i++) pushBits(utf8[i], 8);

    // Terminator
    const remainingBits = maxData * 8 - bits.length;
    pushBits(0, Math.min(4, Math.max(0, remainingBits)));

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad bytes
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < maxData * 8) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    const dataBytes = new Uint8Array(maxData);
    for (let i = 0; i < maxData; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataBytes[i] = b;
    }

    const ecBytes = rsEncode(dataBytes, ecLen);
    const finalData = new Uint8Array(dataBytes.length + ecBytes.length);
    finalData.set(dataBytes);
    finalData.set(ecBytes, dataBytes.length);

    return { data: finalData, version, size };
  }

  function generate(text) {
    const { data, version, size } = encodeData(text);
    const { matrix, isReserved } = createMatrix(version, size);

    // Data placement
    let bitIdx = 0;
    const totalBits = data.length * 8;
    let right = size - 1;
    let upward = true;

    while (right > 0) {
      if (right === 6) right--; // Skip timing column
      const cols = [right, right - 1];
      const rows = upward
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);

      for (const r of rows) {
        for (const c of cols) {
          if (!isReserved[r][c]) {
            let bit = 0;
            if (bitIdx < totalBits) {
              const byteIdx = Math.floor(bitIdx / 8);
              const bitPos = 7 - (bitIdx % 8);
              bit = (data[byteIdx] >> bitPos) & 1;
              bitIdx++;
            }
            // Mask pattern 0: (row + col) % 2 === 0
            const mask = ((r + c) % 2 === 0) ? 1 : 0;
            matrix[r][c] = bit ^ mask;
          }
        }
      }
      right -= 2;
      upward = !upward;
    }

    // Format info: Mask 0, Level L -> Format bits 0x77c4
    const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
    const fmtCoords1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    const fmtCoords2 = [
      [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
      [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
    ];

    for (let i = 0; i < 15; i++) {
      const bit = formatBits[i];
      const [r1, c1] = fmtCoords1[i];
      matrix[r1][c1] = bit;
      const [r2, c2] = fmtCoords2[i];
      matrix[r2][c2] = bit;
    }

    return { matrix, size };
  }

  function toSvg(text, sizePx = 180) {
    try {
      const { matrix, size } = generate(text);
      const margin = 2;
      const totalCells = size + margin * 2;
      let path = '';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c] === 1) {
            path += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalCells} ${totalCells}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" aria-label="UPI Payment QR Code" class="qr-svg"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path.trim()}" fill="#000000"/></svg>`;
    } catch (e) {
      console.warn('QR Code generation failed', e);
      return `<div class="chart-empty"><p>QR Code unavailable</p></div>`;
    }
  }

  return { toSvg, generate };
})();
