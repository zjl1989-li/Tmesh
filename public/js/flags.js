// split of public/app.js (original section comment preserved below)
export let notifyOn = localStorage.getItem('zjl_notify') === '1';
export let soundOn = localStorage.getItem('zjl_sound') === '1';
export let audioCtx = null;

export function ping() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.04;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.12);
  } catch { /* autoplay policy - fine */ }
}


// cross-module setters (an imported ESM binding is read-only outside its home module)
export function setNotifyOn(v) { notifyOn = v; }
export function setSoundOn(v) { soundOn = v; }
