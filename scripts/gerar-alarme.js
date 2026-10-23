// Generates the medication alarm sound (WAV, PCM 16-bit mono).
//
// Usage: node scripts/gerar-alarme.js <output.wav> [seconds=30] [sampleRate=22050] [style=bips]
//   iOS:     node scripts/gerar-alarme.js assets/sounds/alarme_remedio.wav 30 22050 <style>
//   Android: node scripts/gerar-alarme.js assets/sounds/alarme_remedio_longo.wav 90 16000 <style>
//
// Styles: bips | sino | marimba | melodia | carrilhao
//
// Design choices for older users:
// - mid frequencies (~500-1000 Hz fundamentals): high frequencies are the first lost with
//   age, and phone speakers reproduce low ones poorly
// - a repeating pattern with pauses, recognizable as an alarm and unlike chat notifications
// - starts softer and rises over the first seconds so it doesn't startle
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) throw new Error('usage: node gerar-alarme.js <output.wav> [seconds] [sampleRate] [style]');
const DURACAO = Number(process.argv[3] || 30); // iOS ignores custom sounds longer than 30 s
const RATE = Number(process.argv[4] || 22050);
const ESTILO = process.argv[5] || 'bips';

// Note frequencies (Hz)
const N = { G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5 };

/**
 * Each style: a list of notes { t: start (s, inside the cycle), f: Hz, d: duration (s) },
 * the cycle length and a timbre function (time since note start, note freq) -> sample.
 */
const ESTILOS = {
  // Classic digital alarm, softened: three short beeps
  bips: {
    ciclo: 1.2,
    notas: [
      { t: 0.0, f: 750, d: 0.18 },
      { t: 0.25, f: 950, d: 0.18 },
      { t: 0.5, f: 750, d: 0.18 },
    ],
    timbre: (tn, f, d) => {
      const w = 2 * Math.PI * f * tn;
      const env = Math.min(1, tn / 0.006, (d - tn) / 0.006);
      return ((Math.sin(w) + 0.3 * Math.sin(3 * w)) / 1.3) * env;
    },
  },

  // Doorbell-like "ding-dong": warm and familiar, still clearly a call
  sino: {
    ciclo: 2.4,
    notas: [
      { t: 0.0, f: N.E5, d: 1.1 },
      { t: 0.6, f: N.C5, d: 1.6 },
    ],
    timbre: (tn, f) => {
      // bell partials (slightly inharmonic) with exponential decay
      const parciais = [
        [1, 1.0, 1.6],
        [2.0, 0.5, 2.4],
        [3.01, 0.25, 3.2],
        [4.17, 0.12, 4.0],
      ];
      let v = 0;
      for (const [mult, amp, dec] of parciais) v += amp * Math.sin(2 * Math.PI * f * mult * tn) * Math.exp(-dec * tn);
      const ataque = Math.min(1, tn / 0.004);
      return (v / 1.9) * ataque;
    },
  },

  // Rising marimba arpeggio (C-E-G-C), similar to modern phone alarms
  marimba: {
    ciclo: 1.8,
    notas: [
      { t: 0.0, f: N.C5, d: 0.5 },
      { t: 0.16, f: N.E5, d: 0.5 },
      { t: 0.32, f: N.G5, d: 0.5 },
      { t: 0.48, f: N.C6, d: 0.7 },
    ],
    timbre: (tn, f) => {
      const v =
        Math.sin(2 * Math.PI * f * tn) * Math.exp(-6 * tn) +
        0.35 * Math.sin(2 * Math.PI * f * 4 * tn) * Math.exp(-14 * tn);
      return (v / 1.2) * Math.min(1, tn / 0.003);
    },
  },

  // Short friendly melody (like a radio jingle), then a pause
  melodia: {
    ciclo: 2.6,
    notas: [
      { t: 0.0, f: N.G4, d: 0.35 },
      { t: 0.2, f: N.C5, d: 0.35 },
      { t: 0.4, f: N.E5, d: 0.35 },
      { t: 0.6, f: N.G5, d: 0.45 },
      { t: 0.95, f: N.E5, d: 0.3 },
      { t: 1.15, f: N.G5, d: 0.7 },
    ],
    timbre: (tn, f, d) => {
      const w = 2 * Math.PI * f * tn;
      const v = Math.sin(w) + 0.25 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w);
      const env = Math.min(1, tn / 0.01) * Math.exp(-2.2 * tn) * Math.min(1, (d - tn) / 0.03);
      return (v / 1.35) * Math.max(0, env);
    },
  },

  // Clock-tower chime: four descending bell notes, calm but unmistakable
  carrilhao: {
    ciclo: 3.2,
    notas: [
      { t: 0.0, f: N.E5, d: 1.2 },
      { t: 0.45, f: N.D5, d: 1.2 },
      { t: 0.9, f: N.C5, d: 1.2 },
      { t: 1.35, f: N.G4, d: 1.8 },
    ],
    timbre: (tn, f) => {
      let v = 0;
      for (const [mult, amp, dec] of [
        [1, 1.0, 1.4],
        [2.0, 0.45, 2.2],
        [2.76, 0.2, 3.0],
      ]) v += amp * Math.sin(2 * Math.PI * f * mult * tn) * Math.exp(-dec * tn);
      return (v / 1.65) * Math.min(1, tn / 0.004);
    },
  },
};

const estilo = ESTILOS[ESTILO];
if (!estilo) throw new Error(`unknown style "${ESTILO}". Options: ${Object.keys(ESTILOS).join(', ')}`);

const total = Math.round(RATE * DURACAO);
const mix = new Float32Array(total);

// Lay every note of every cycle over the timeline (notes may overlap and ring out)
for (let inicioCiclo = 0; inicioCiclo < DURACAO; inicioCiclo += estilo.ciclo) {
  for (const nota of estilo.notas) {
    const inicio = inicioCiclo + nota.t;
    const cauda = Math.max(nota.d, 1.5); // let bells ring past the nominal duration
    const i0 = Math.round(inicio * RATE);
    const i1 = Math.min(total, Math.round((inicio + cauda) * RATE));
    for (let i = i0; i < i1; i++) {
      const tn = (i - i0) / RATE;
      const d = estilo === ESTILOS.bips || estilo === ESTILOS.melodia ? nota.d : cauda;
      if (tn > d) break;
      mix[i] += estilo.timbre(tn, nota.f, d);
    }
  }
}

// Normalize, then gentle crescendo over the first 8 s and a short fade at the end
let pico = 0;
for (const v of mix) pico = Math.max(pico, Math.abs(v));
const samples = new Int16Array(total);
for (let i = 0; i < total; i++) {
  const t = i / RATE;
  const crescendo = 0.35 + 0.65 * Math.min(1, t / 8);
  const fim = Math.min(1, (DURACAO - t) / 0.15);
  samples[i] = Math.round((mix[i] / (pico || 1)) * crescendo * fim * 32767 * 0.95);
}

const dataBytes = samples.length * 2;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // mono
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);
Buffer.from(samples.buffer).copy(buf, 44);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`ok: ${out} (${ESTILO}, ${DURACAO}s, ${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
