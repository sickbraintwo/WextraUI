import { app } from "../../scripts/app.js";

// WDifference: guardia al caricamento. Un wf salvato prima che esistesse changes_max (14/09) ha i valori salvati
// scalati di uno: nella casella changes_max finisce il testo di ignore ("" -> mostrato 0) e il server rifiuta il run
// ("couldn't be converted to INT"). Qui, dopo il configure, un changes_max che non e' un numero valido torna a 240.
app.registerExtension({
    name: "wextraui.rundiff",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxRunDiff") return;
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            const w = (this.widgets || []).find((x) => x.name === "changes_max");
            if (w) {
                const v = Number(w.value);
                if (!Number.isFinite(v) || v < 20 || v > 255) { w.value = 240; this.setDirtyCanvas(true, true); }
            }
            return r;
        };
    },
});
