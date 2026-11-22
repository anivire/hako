import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { type Extension, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

export function languageOf(path: string): { name: string; extension: Extension | null } {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['json', 'json5', 'mcmeta'].includes(ext)) return { name: 'JSON', extension: json() }
  if (['yml', 'yaml'].includes(ext)) return { name: 'YAML', extension: yaml() }
  if (['js', 'mjs', 'cjs'].includes(ext)) return { name: 'JavaScript', extension: javascript() }
  if (ext === 'ts') return { name: 'TypeScript', extension: javascript({ typescript: true }) }
  if (['properties', 'cfg', 'ini', 'conf', 'env'].includes(ext)) return { name: 'Properties', extension: StreamLanguage.define(properties) }
  if (ext === 'toml') return { name: 'TOML', extension: StreamLanguage.define(toml) }
  if (['sh', 'bash'].includes(ext)) return { name: 'Shell', extension: StreamLanguage.define(shell) }
  return { name: 'Text', extension: null }
}

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--color-accent)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-success)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--color-warning)' },
  { tag: [tags.propertyName, tags.attributeName, tags.definition(tags.propertyName)], color: 'var(--color-info)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--color-subtle-foreground)', fontStyle: 'italic' },
  { tag: [tags.heading, tags.typeName, tags.className], color: 'var(--color-accent)', fontWeight: '600' },
  { tag: tags.invalid, color: 'var(--color-danger)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', color: 'var(--color-foreground)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace", lineHeight: '1.65' },
  '.cm-content': { caretColor: 'var(--color-accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent)', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--color-subtle-foreground)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--color-foreground) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-foreground)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--color-accent) 28%, transparent)',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--color-accent) 14%, transparent)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in oklab, var(--color-warning) 30%, transparent)', outline: 'none' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in oklab, var(--color-warning) 55%, transparent)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--color-accent) 22%, transparent)', outline: 'none' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--color-muted)', border: 'none', color: 'var(--color-muted-foreground)', padding: '0 6px', borderRadius: '4px' },
  '.cm-panels': { backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-border)' },
  '.cm-panel.cm-search': { padding: '8px 12px', fontFamily: 'inherit', fontSize: '13px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { borderRadius: '6px', border: 'none', backgroundColor: 'var(--color-field)', color: 'inherit', padding: '3px 8px', margin: '2px 4px 2px 0', backgroundImage: 'none' },
  '.cm-panel.cm-search label': { fontSize: '12px', color: 'var(--color-muted-foreground)' },
  '.cm-tooltip': { backgroundColor: 'var(--color-popover)', border: '1px solid var(--color-border)', borderRadius: '8px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-foreground)' },
})

export function CodeEditor({ path, value, onChange, onSave }: { path: string; value: string; onChange: (value: string) => void; onSave: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef({ onChange, onSave })
  latest.current = { onChange, onSave }
  useEffect(() => {
    const language = languageOf(path).extension
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (latest.current.onSave(), true) }]),
          basicSetup,
          theme,
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          ...(language ? [language] : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.focus()
    return () => view.destroy()
  }, [path])
  return <div ref={host} className="size-full overflow-hidden [&_.cm-editor]:h-full" />
}
