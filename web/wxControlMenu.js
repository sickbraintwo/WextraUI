// Il menu del control si apre su `fixed`, su ogni nodo: toglie il campo Filter list che il frontend mette sopra alle liste lunghe.
// WextraUI — the menu of a control opens on `fixed` (Sick 02/11/2026). The frontend puts a search box on top of any menu
// over 4 entries, and a control with `increment-wrap` has 5: the box took the place under the pointer. Five words need no
// search. One piece, for every node, on the two renderers; the lists of names keep their box.
import { app } from "../../scripts/app.js";

const WORDS = new Set(["fixed", "increment", "decrement", "randomize", "increment-wrap"]);
const isControl = (list) => Array.isArray(list) && list.length > 0 && list.every((v) => WORDS.has(v));

const VUE_MENU = '[data-testid="widget-select-default-overlay"]';
const VUE_BOX = '[data-testid="widget-select-default-search-input"]';

// Nodes 2.0: the box out of the view, not out of the page. It holds the focus of the open menu: without it the menu closes.
function vueTame(box) {
    const words = [...(box.closest(VUE_MENU)?.querySelectorAll('[role="option"]') || [])].map((e) => e.textContent.trim());
    if (isControl(words)) box.parentElement.style.cssText = "position:absolute;width:0;height:0;margin:0;padding:0;border:0;overflow:hidden;opacity:0";
}

app.registerExtension({
    name: "WextraUI.controlMenu",
    setup() {
        // Canvas: the box goes only on a menu whose class is exactly `dark`; a second class keeps the look and leaves it out.
        // Both ways in: other packs wrap this menu and call it as a plain function, not with `new`.
        const tamed = (values, options) => (options?.className === "dark" && isControl(values) ? { ...options, className: "dark wx-control-menu" } : options);
        LiteGraph.ContextMenu = new Proxy(LiteGraph.ContextMenu, {
            construct: (Menu, [values, options, ...rest]) => new Menu(values, tamed(values, options), ...rest),
            apply: (Menu, self, [values, options, ...rest]) => Menu.call(self, values, tamed(values, options), ...rest),
        });
        // The box takes the focus as the menu opens; the entries may land a frame later, and the frame is not painted yet.
        document.addEventListener("focusin", (e) => {
            if (!e.target.matches?.(VUE_BOX)) return;
            vueTame(e.target);
            requestAnimationFrame(() => vueTame(e.target));
        }, true);
    },
});
