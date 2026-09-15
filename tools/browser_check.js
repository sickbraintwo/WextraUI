// WextraUI — paste in the browser console of ComfyUI (F12) with a workflow open. Two checks, nothing is saved:
//  1. every WextraUI node type created fresh: its serializable widgets = the widget inputs of object_info, one slot each;
//  2. nodes taken from saved files (edit FILES/PICKS below) are loaded through configure() on a fresh node and their
//     values printed — this is how an old file is really tested (a tab restored after F5 carries the old session, not the file).
(async () => {
  const app = window.app || window.comfyAPI?.app?.app, g = app.graph;
  const oi = await fetch('/object_info').then(r => r.json());
  const isW = (sp) => { const t = sp[0], o = sp[1] || {}; if (o.forceInput) return false; return Array.isArray(t) || ['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO'].includes(t); };
  const schemaW = (type) => { const i = oi[type].input, out = []; for (const [k, sp] of [...Object.entries(i.required || {}), ...Object.entries(i.optional || {})]) if (isW(sp)) { out.push(k); if (sp[1]?.control_after_generate || k === 'seed' || k === 'noise_seed') out.push('control_after_generate'); } return out; };
  const live = (n) => (n.widgets || []).filter(w => w.serialize !== false);
  const types = Object.keys(oi).filter(k => /^(wx|h3|saveWimage)/.test(k)).sort();
  console.log('--- 1. fresh nodes');
  for (const t of types) {
    const n = LiteGraph.createNode(t); g.add(n);
    const wv = n.serialize().widgets_values || [], L = live(n), S = schemaW(t);
    const ok = L.length === S.length && wv.length === L.length && !wv.includes(null);
    console.log((ok ? 'ok   ' : 'BAD  ') + t + ' widgets=' + L.length + ' schema=' + S.length + ' saved=' + wv.length + (ok ? '' : '\n   live:   ' + L.map(w => w.name).join(',') + '\n   schema: ' + S.join(',')));
    g.remove(n);
  }
  // 2. nodes from files: FILES = names under user/default/workflows; PICKS = [file key, node id]
  const FILES = { pony: 'Pony.json' };
  const PICKS = [['pony', 318]];
  const loaded = {};
  for (const [k, f] of Object.entries(FILES)) loaded[k] = await fetch('/api/userdata/' + encodeURIComponent('workflows/' + f), { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
  console.log('--- 2. nodes from files');
  for (const [k, id] of PICKS) {
    const src = loaded[k]?.nodes?.find(n => n.id === id); if (!src) { console.log('missing', k, id); continue; }
    const j = JSON.parse(JSON.stringify(src)); delete j.id; (j.inputs || []).forEach(i => i.link = null); (j.outputs || []).forEach(o => o.links = null);
    const n = LiteGraph.createNode(j.type); g.add(n);
    try { n.configure(j); const wv = n.serialize().widgets_values || []; console.log(k + '#' + id + ' ' + j.type + ' saved=' + wv.length + ' nulls=' + wv.filter(v => v === null).length + '\n   ' + live(n).map(w => w.name + '=' + JSON.stringify(w.value).slice(0, 24)).join(' ')); }
    catch (e) { console.log(k + '#' + id + ' ERROR ' + e); }
    g.remove(n);
  }
})();
