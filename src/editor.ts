import {
    EditorView, 
    WidgetType,
    Decoration,
    PluginSpec,
    PluginValue,
    ViewPlugin,
    ViewUpdate,
    MatchDecorator
} from "@codemirror/view";

class DotWidget extends WidgetType {
    constructor(private readonly placeholder: boolean) {
        super();
    }
    toDOM(): HTMLElement {
        const dot = createSpan({
            text: this.placeholder ? "\u2717" : "\u2713",
            attr: {
                style: [
                    "display:inline-block",
                    // "margin-left:0.1em",
                    // "margin-right:0.1em",
                    "vertical-align:super",
                    "font-size:0.7em",
                    // "line-height:1",
                    "color:var(--text-faint)",
                ].join(";")
            }
        });
        return dot;
    }
    eq(other: DotWidget): boolean {
        return this.placeholder === other.placeholder;
    }
}

const matcher = new MatchDecorator({
    regexp: /<!--things-(todo|heading|project)-id:(_)?(\w*)-->/g,
    decoration: (match) => Decoration.replace({
        widget: new DotWidget(match[2] !== undefined),
    })
});

class DotPlugin implements PluginValue {
    decorations;
    constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
    }
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = matcher.updateDeco(update, this.decorations);
        }
    }
    destroy() {}
}

const dotPluginSpec: PluginSpec<DotPlugin> = {
    decorations: (value) => value.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
};

export const dotPlugin = ViewPlugin.fromClass(DotPlugin, dotPluginSpec);