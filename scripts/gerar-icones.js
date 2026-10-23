// Generates the app icons (PNG) with a medication capsule, no image libraries needed.
//
// Usage: node scripts/gerar-icones.js
//
// Writes to assets/:
// - icon.png              1024x1024, capsule on the brand green (iOS and legacy Android)
// - adaptive-icon.png     1024x1024, transparent, capsule inside the Android safe zone
//                         (the background color comes from app.json)
// - splash.png            1024x1024, transparent, capsule (splash background is in app.json)
// - favicon.png           48x48, web
// - notification-icon.png 96x96, white silhouette on transparent (Android tints it)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VERDE = [0x0d, 0x6b, 0x58];
const BRANCO = [0xff, 0xff, 0xff];
const MENTA = [0x9f, 0xe3, 0xcf];
const DIVISAO = [0x0a, 0x52, 0x44];

// ---------------------------------------------------------------------------
// PNG encoding (RGBA 8-bit)
// ---------------------------------------------------------------------------
const CRC_TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bloco = (tipo, dados) => {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
};
const codificarPng = (tamanho, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const linhas = Buffer.alloc(tamanho * (tamanho * 4 + 1));
  for (let y = 0; y < tamanho; y++) {
    linhas[y * (tamanho * 4 + 1)] = 0; // no filter
    rgba.copy(linhas, y * (tamanho * 4 + 1) + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
};

// ---------------------------------------------------------------------------
// Drawing: every shape is a signed distance (in pixels) so edges are anti-aliased
// ---------------------------------------------------------------------------

/** Capsule from A to B with radius r: distance to the shape and position along it (0..1) */
const capsula = (px, py, ax, ay, bx, by, r) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) - r;
  // Unclamped position, so the divider line is a straight cut across the capsule
  const u = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  return { d, u };
};

/** Rounded square filling the image (only for the full icon background) */
const quadradoArredondado = (px, py, tam, raio) => {
  const c = tam / 2;
  const qx = Math.abs(px - c) - (c - raio);
  const qy = Math.abs(py - c) - (c - raio);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - raio;
};

const cobertura = (d) => Math.max(0, Math.min(1, 0.5 - d));

/** Paints color `cor` with opacity `a` over the pixel at index i */
const pintar = (img, i, cor, a) => {
  if (a <= 0) return;
  const fundoA = img[i + 3] / 255;
  const saidaA = a + fundoA * (1 - a);
  for (let k = 0; k < 3; k++) {
    img[i + k] = Math.round((cor[k] * a + img[i + k] * fundoA * (1 - a)) / saidaA);
  }
  img[i + 3] = Math.round(saidaA * 255);
};

/**
 * Draws the image. `escala` is the capsule size relative to the image (the adaptive icon
 * needs it smaller: Android crops the outer third into circles, squircles, etc.).
 */
const desenhar = (tam, { fundo = false, escala = 1, silhueta = false } = {}) => {
  const img = Buffer.alloc(tam * tam * 4);
  const c = tam / 2;
  // Capsule tilted 45°, from bottom-left to top-right
  const meio = 0.25 * tam * escala;
  const raio = 0.155 * tam * escala;
  const ax = c - meio;
  const ay = c + meio;
  const bx = c + meio;
  const by = c - meio;
  const larguraDivisao = Math.max(1, 0.012 * tam * escala);
  const comprimento = Math.hypot(bx - ax, by - ay);
  const sombra = 0.025 * tam * escala;

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const i = (y * tam + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      if (fundo) pintar(img, i, VERDE, cobertura(quadradoArredondado(px, py, tam, 0)));

      if (!silhueta) {
        // Soft shadow below the capsule
        const s = capsula(px, py - sombra, ax, ay, bx, by, raio);
        pintar(img, i, [0, 0, 0], 0.22 * Math.max(0, Math.min(1, 0.5 - s.d / (sombra * 1.5))));
      }

      const { d, u } = capsula(px, py, ax, ay, bx, by, raio);
      const a = cobertura(d);
      if (a <= 0) continue;
      const distDivisao = Math.abs(u - 0.5) * comprimento - larguraDivisao / 2;

      if (silhueta) {
        // Monochrome: the divider becomes a transparent gap
        pintar(img, i, BRANCO, a * (1 - cobertura(-distDivisao)));
        continue;
      }

      pintar(img, i, u < 0.5 ? BRANCO : MENTA, a);
      pintar(img, i, DIVISAO, a * cobertura(distDivisao));
    }
  }
  return codificarPng(tam, img);
};

const ASSETS = path.join(__dirname, '..', 'assets');
const saidas = {
  'icon.png': desenhar(1024, { fundo: true, escala: 0.8 }),
  'adaptive-icon.png': desenhar(1024, { escala: 0.62 }),
  'splash.png': desenhar(1024, { escala: 0.6 }),
  'favicon.png': desenhar(48, { fundo: true, escala: 0.9 }),
  'notification-icon.png': desenhar(96, { silhueta: true, escala: 0.9 }),
};
for (const [nome, png] of Object.entries(saidas)) {
  fs.writeFileSync(path.join(ASSETS, nome), png);
  console.log(`${nome}: ${png.length} bytes`);
}
