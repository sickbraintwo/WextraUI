// WextraUI — WFrame: crop_width / crop_height only when crop_to = custom; a colour picker under pad_color.
import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxLabel, wxCompactWidgets, wxOnRedraw } from "./wxStyle.js";

function setHidden(w, hidden) {
    if (!w) return;
    if (hidden) {
        if (!w._wxType) w._wxType = w.type;
        w.hidden = true; if (w.options) w.options.hidden = true;
        w.computeSize = () => [0, -4];
        if (w.element) w.element.style.display = "none";
    } else {
        w.hidden = false; if (w.options) w.options.hidden = false;
        delete w.computeSize;
        if (w.element) w.element.style.display = "";
    }
}

app.registerExtension({
    name: "WextraUI.frame",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxFrame") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (n) => node.widgets.find((w) => w.name === n);
            const wCrop = W("crop_to"), wCW = W("crop_width"), wCH = W("crop_height"), wColor = W("pad_color");

            // crop size only for custom
            let lastCrop = null;
            const applyCrop = () => {
                if (!wCrop || wCrop.value === lastCrop) return;
                lastCrop = wCrop.value;
                const custom = wCrop.value === "custom";
                setHidden(wCW, !custom); setHidden(wCH, !custom);
                node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true);
            };
            if (wCrop) { const cb = wCrop.callback; wCrop.callback = function (...a) { const rr = cb?.apply(this, a); lastCrop = null; applyCrop(); return rr; }; }

            // colour picker
            if (wColor) {
                ensureWxStyle();
                const box = document.createElement("div"); box.className = "wx wx-row";
                box.style.cssText = "gap:8px;padding:2px 8px;flex-wrap:nowrap";
                const inp = document.createElement("input"); inp.type = "color";
                inp.style.cssText = "width:34px;height:20px;padding:0;border:1px solid #555;border-radius:4px;background:#222;cursor:pointer";
                const lab = wxLabel("pad colour"); lab.style.margin = "0";
                box.append(inp, lab);
                box.addEventListener("pointerdown", (e) => e.stopPropagation());
                const norm = (v) => { let c = String(v || "").trim().replace(/^#/, ""); if (c.length === 3) c = c.split("").map((x) => x + x).join(""); return /^[0-9a-f]{6}$/i.test(c) ? "#" + c.toLowerCase() : "#000000"; };
                inp.value = norm(wColor.value);
                inp.addEventListener("input", () => { wColor.value = inp.value; node.setDirtyCanvas(true, true); });
                const picker = node.addDOMWidget("pad_picker", "custom", box, { serialize: false, hideOnZoom: false, getValue: () => wColor.value, setValue: () => {} });
                picker.serialize = false;   // the picker mirrors the color box: no slot of its own in widgets_values
                picker.computeSize = (w) => [w, 26];
                const i = node.widgets.indexOf(picker), j = node.widgets.indexOf(wColor);
                if (i > j + 1) { node.widgets.splice(i, 1); node.widgets.splice(j + 1, 0, picker); }
                node._wxSyncPicker = () => { const v = norm(wColor.value); if (inp.value !== v) inp.value = v; };
                wxCompactWidgets(node);
            }

            // the combo's callback does not always fire in the new frontend: watch on every redraw (and on a timer under Nodes 2.0)
            wxOnRedraw(node, () => { applyCrop(); node._wxSyncPicker?.(); });
            const onConf = node.onConfigure;
            node.onConfigure = function () { const rr = onConf?.apply(this, arguments); lastCrop = null; applyCrop(); return rr; };
            setTimeout(applyCrop, 0);
            return r;
        };
    },
});
