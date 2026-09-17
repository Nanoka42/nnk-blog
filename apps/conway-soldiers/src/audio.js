const FILES = { edit: 'place_or_unplace.wav', move: 'move.wav', undo: 'undo_move.wav', reset: 'reset.wav' };

export class SoundBank {
  constructor() {
    this.enabled = true; this.context = null; this.buffers = new Map(); this.active = new Set();
    this.data = new Map(Object.entries(FILES).map(([name, file]) => [name,
      fetch(new URL(`../sounds/${file}`, import.meta.url)).then(response => {
        if (!response.ok) throw new Error('Sound unavailable');
        return response.arrayBuffer();
      }).catch(() => null),
    ]));
  }
  unlock() {
    if (!this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        for (const [name, promise] of this.data) {
          this.buffers.set(name, promise.then(data => data ? this.context.decodeAudioData(data) : null).catch(() => null));
        }
      }
      if (this.context.state !== 'running') this.context.resume().catch(() => {});
    } catch { /* Audio is optional; the board must remain interactive. */ }
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
    else for (const node of this.active) { try { node.stop(); } catch { /* already ended */ } }
  }
  async play(name) {
    if (!this.enabled) return;
    this.unlock();
    const buffer = await this.buffers.get(name);
    if (!buffer || !this.enabled || this.context?.state !== 'running') return;
    try {
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = .55;
      source.connect(gain); gain.connect(this.context.destination);
      this.active.add(source);
      source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
    } catch { /* Browser audio interruptions must not interrupt a move. */ }
  }
}
