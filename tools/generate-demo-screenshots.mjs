import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const toCrc = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(toCrc), 8 + len);
  return buf;
}

// 5x7 bitmap font for rendering text on raw pixel buffer
const FONT = {
  ' ': [0,0,0,0,0,0,0],
  'A': [0x0E,0x11,0x11,0x1F,0x11,0x11,0x11],
  'B': [0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
  'C': [0x0E,0x11,0x10,0x10,0x10,0x11,0x0E],
  'D': [0x1C,0x12,0x11,0x11,0x11,0x12,0x1C],
  'E': [0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F],
  'F': [0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
  'G': [0x0E,0x11,0x10,0x17,0x11,0x11,0x0F],
  'H': [0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
  'I': [0x0E,0x04,0x04,0x04,0x04,0x04,0x0E],
  'J': [0x07,0x02,0x02,0x02,0x02,0x12,0x0C],
  'K': [0x11,0x12,0x14,0x18,0x14,0x12,0x11],
  'L': [0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
  'M': [0x11,0x1B,0x15,0x11,0x11,0x11,0x11],
  'N': [0x11,0x19,0x15,0x13,0x11,0x11,0x11],
  'O': [0x0E,0x11,0x11,0x11,0x11,0x11,0x0E],
  'P': [0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
  'Q': [0x0E,0x11,0x11,0x11,0x15,0x12,0x0D],
  'R': [0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  'S': [0x0E,0x11,0x10,0x0E,0x01,0x11,0x0E],
  'T': [0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
  'U': [0x11,0x11,0x11,0x11,0x11,0x11,0x0E],
  'V': [0x11,0x11,0x11,0x11,0x11,0x0A,0x04],
  'W': [0x11,0x11,0x11,0x15,0x15,0x15,0x0A],
  'X': [0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
  'Y': [0x11,0x11,0x0A,0x04,0x04,0x04,0x04],
  'Z': [0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
  '0': [0x0E,0x11,0x13,0x15,0x19,0x11,0x0E],
  '1': [0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
  '2': [0x0E,0x11,0x01,0x06,0x08,0x10,0x1F],
  '3': [0x1E,0x01,0x01,0x0E,0x01,0x01,0x1E],
  '4': [0x02,0x06,0x0A,0x12,0x1F,0x02,0x02],
  '5': [0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E],
  '6': [0x06,0x08,0x10,0x1E,0x11,0x11,0x0E],
  '7': [0x1F,0x01,0x02,0x04,0x08,0x08,0x08],
  '8': [0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E],
  '9': [0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C],
  ':': [0,0x04,0,0,0x04,0,0],
  '.': [0,0,0,0,0,0x04,0x04],
  ',': [0,0,0,0,0x04,0x04,0x08],
  '-': [0,0,0,0x1F,0,0,0],
  '#': [0x0A,0x0A,0x1F,0x0A,0x1F,0x0A,0x0A],
  '(': [0x02,0x04,0x08,0x08,0x08,0x04,0x02],
  ')': [0x08,0x04,0x02,0x02,0x02,0x04,0x08],
  '@': [0x0E,0x11,0x17,0x15,0x17,0x10,0x0F],
  '/': [0x01,0x02,0x04,0x08,0x10,0x00,0x00],
  '₹': [0x1F,0x04,0x1E,0x04,0x06,0x09,0x11],
  '✓': [0x00,0x01,0x03,0x16,0x1C,0x08,0x00]
};

function createBitmap(w, h) {
  const pixels = Buffer.alloc(w * h * 4, 0xFF); // White background
  
  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = (y * w + x) * 4;
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  }
  
  function fillRect(x0, y0, bw, bh, r, g, b) {
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        setPixel(x, y, r, g, b);
      }
    }
  }

  function drawText(str, startX, startY, scale = 1, r = 10, g = 10, b = 10) {
    let curX = startX;
    const upper = str.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      const glyph = FONT[ch] || FONT[' '];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRect(curX + col * scale, startY + row * scale, scale, scale, r, g, b);
          }
        }
      }
      curX += 6 * scale;
    }
  }

  function drawCircle(cx, cy, radius, r, g, b) {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          setPixel(cx + x, cy + y, r, g, b);
        }
      }
    }
  }

  function toPNG() {
    const rawScanlines = Buffer.alloc(h * (w * 4 + 1));
    let srcPos = 0;
    let dstPos = 0;
    for (let y = 0; y < h; y++) {
      rawScanlines[dstPos++] = 0; // filter type 0 (None)
      pixels.copy(rawScanlines, dstPos, srcPos, srcPos + w * 4);
      srcPos += w * 4;
      dstPos += w * 4;
    }

    const compressed = zlib.deflateSync(rawScanlines);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // no interlace

    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrChunk = makeChunk('IHDR', ihdr);
    const idatChunk = makeChunk('IDAT', compressed);
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
  }

  return { setPixel, fillRect, drawText, drawCircle, toPNG };
}

const DEMO_TXNS = [
  { id: '01', app: 'Google Pay', payee: 'SWIGGY', vpa: 'swiggy@icici', amount: '240.00', date: '28 Sep 2026, 08:45 PM', ref: '429810482910', note: 'Dinner order' },
  { id: '02', app: 'PhonePe', payee: 'CHAI POINT', vpa: 'chaipoint@axisbank', amount: '40.00', date: '28 Sep 2026, 05:15 PM', ref: '429810482911', note: 'Masala chai' },
  { id: '03', app: 'Google Pay', payee: 'CAMPUS CANTEEN', vpa: 'canteen@okhdfcbank', amount: '120.00', date: '29 Sep 2026, 01:20 PM', ref: '429810482912', note: 'Lunch thali' },
  { id: '04', app: 'Paytm UPI', payee: 'RAHUL VERMA', vpa: 'rahul.verma@paytm', amount: '350.00', date: '29 Sep 2026, 09:30 PM', ref: '429810482913', note: 'WiFi split' },
  { id: '05', app: 'Google Pay', payee: 'ZOMATO', vpa: 'zomato@hdfcbank', amount: '380.00', date: '30 Sep 2026, 09:10 PM', ref: '429810482914', note: 'Biryani combo' },
  { id: '06', app: 'PhonePe', payee: 'METRO SMART CARD', vpa: 'metrorecharge@sbi', amount: '50.00', date: '30 Sep 2026, 10:05 AM', ref: '429810482915', note: 'Metro travel' },
  { id: '07', app: 'Google Pay', payee: 'COLLEGE BOOKSTORE', vpa: 'bookstore@icici', amount: '450.00', date: '01 Oct 2026, 03:40 PM', ref: '429810482916', note: 'Engineering textbooks' },
  { id: '08', app: 'Paytm UPI', payee: 'NESCAFE KIOSK', vpa: 'nescafe@paytm', amount: '60.00', date: '01 Oct 2026, 06:10 PM', ref: '429810482917', note: 'Cold coffee' },
  { id: '09', app: 'Google Pay', payee: 'HOSTEL MESS', vpa: 'hostelmess@sbi', amount: '4500.00', date: '02 Oct 2026, 11:00 AM', ref: '429810482918', note: 'Monthly mess dues' },
  { id: '10', app: 'PhonePe', payee: 'RAPIDO AUTO', vpa: 'rapido@axis', amount: '180.00', date: '02 Oct 2026, 08:30 PM', ref: '429810482919', note: 'Auto fare' },
  { id: '11', app: 'Google Pay', payee: 'NETFLIX INDIA', vpa: 'netflix@citi', amount: '649.00', date: '02 Oct 2026, 10:15 PM', ref: '429810482920', note: 'Monthly subscription' },
  { id: '12', app: 'Google Pay', payee: 'SPOTIFY INDIA', vpa: 'spotify@hdfcbank', amount: '119.00', date: '03 Oct 2026, 07:00 AM', ref: '429810482921', note: 'Student premium' },
  { id: '13', app: 'PhonePe', payee: 'JIO PREPAID', vpa: 'jio@icici', amount: '299.00', date: '03 Oct 2026, 12:45 PM', ref: '429810482922', note: 'Monthly 2GB/day plan' },
  { id: '14', app: 'Paytm UPI', payee: 'XEROX & PRINT SHOP', vpa: 'printshop@paytm', amount: '150.00', date: '03 Oct 2026, 02:15 PM', ref: '429810482923', note: 'Lab report printing' },
  { id: '15', app: 'Google Pay', payee: 'PVR CINEMAS', vpa: 'pvrcinemas@kotak', amount: '600.00', date: '03 Oct 2026, 06:30 PM', ref: '429810482924', note: 'Movie tickets' }
];

const outDir = path.resolve('assets/demo-screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating 15 UPI screenshot mock images...');

DEMO_TXNS.forEach(txn => {
  const bmp = createBitmap(360, 560);
  
  // Header background (UPI dark theme style)
  bmp.fillRect(0, 0, 360, 560, 246, 248, 250);
  bmp.fillRect(0, 0, 360, 70, 26, 115, 232); // App top banner

  // Status bar
  bmp.drawText(txn.app, 20, 25, 2, 255, 255, 255);
  bmp.drawText('UPI PAYMENT', 230, 28, 1, 220, 240, 255);

  // Success Circle
  bmp.drawCircle(180, 130, 32, 30, 170, 90);
  bmp.drawText('OK', 170, 122, 2, 255, 255, 255);

  // Status title
  bmp.drawText('PAID SUCCESSFULLY', 95, 175, 2, 20, 130, 60);

  // Amount
  bmp.drawText(`RS. ${txn.amount}`, 110, 210, 3, 20, 20, 20);

  // Card details container
  bmp.fillRect(20, 255, 320, 240, 255, 255, 255);
  // Border line
  bmp.fillRect(20, 255, 320, 2, 220, 225, 230);
  bmp.fillRect(20, 495, 320, 2, 220, 225, 230);
  bmp.fillRect(20, 255, 2, 240, 220, 225, 230);
  bmp.fillRect(338, 255, 2, 240, 220, 225, 230);

  // Details
  bmp.drawText('TO', 35, 275, 1, 120, 120, 120);
  bmp.drawText(txn.payee, 35, 290, 2, 20, 20, 20);
  bmp.drawText(txn.vpa, 35, 312, 1, 100, 100, 100);

  bmp.drawText('DATE & TIME', 35, 340, 1, 120, 120, 120);
  bmp.drawText(txn.date, 35, 355, 1, 40, 40, 40);

  bmp.drawText('UPI TRANSACTION ID', 35, 385, 1, 120, 120, 120);
  bmp.drawText(txn.ref, 35, 400, 1, 40, 40, 40);

  bmp.drawText('NOTE', 35, 430, 1, 120, 120, 120);
  bmp.drawText(txn.note, 35, 445, 1, 40, 40, 40);

  bmp.drawText('PAID FROM: HDFC BANK A/C XX1234', 35, 470, 1, 100, 120, 140);

  // Footer
  bmp.drawText('YOKO! STUDENT SAMPLE DEMO SCREENSHOT', 40, 525, 1, 150, 150, 150);

  const pngData = bmp.toPNG();
  const filePath = path.join(outDir, `upi_${txn.id}.png`);
  fs.writeFileSync(filePath, pngData);
  console.log(`Generated: ${filePath}`);
});

console.log('All 15 screenshots generated successfully.');
