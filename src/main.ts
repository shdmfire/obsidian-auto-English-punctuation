import { Plugin } from "obsidian";
import { Annotation, type Extension } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
  AutoEnglishPunctuationSettingTab,
  DEFAULT_SETTINGS,
  type AutoEnglishPunctuationSettings,
  sanitizePunctuationMap,
} from "./settings";

const INTERNAL_CHANGE = Annotation.define<boolean>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createNormalizer(map: Record<string, string>): (text: string) => string {
  const keys = Object.keys(map)
    .filter((key) => key.length > 0)
    .sort((a, b) => b.length - a.length); // 先匹配长串，保证 “……” 这类优先

  if (keys.length === 0) {
    return (text: string) => text;
  }

  const pattern = keys.map(escapeRegExp).join("|");
  const regex = new RegExp(pattern, "g");

  return (text: string) => {
    return text.replace(regex, (matched) => map[matched] ?? matched);
  };
}

function buildPunctuationExtension(map: Record<string, string>): Extension {
  const normalize = createNormalizer(map);

  return [
    // 1) 普通键入：直接拦截并替换
    EditorView.inputHandler.of((view, from, to, text) => {
      if (view.composing) return false; // 中文输入法组词时不打断

      const normalized = normalize(text);
      if (normalized === text) return false;

      view.dispatch({
        changes: { from, to, insert: normalized },
        selection: { anchor: from + normalized.length },
        userEvent: "input",
        annotations: INTERNAL_CHANGE.of(true),
      });

      return true;
    }),

    // 2) 粘贴：顺手替换
    EditorView.clipboardInputFilter.of((text) => normalize(text)),

    // 3) IME 兜底：有些输入法会在最终上屏后才真正写入字符
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.docChanged) return;
      if (update.view.composing) return;

      // 忽略插件自己触发的二次 dispatch，避免重复处理
      if (update.transactions.some((tr) => tr.annotation(INTERNAL_CHANGE))) {
        return;
      }

      const changes: { from: number; to: number; insert: string }[] = [];

      update.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
        const raw = inserted.toString();
        const normalized = normalize(raw);

        if (raw !== normalized) {
          changes.push({
            from: fromB,
            to: toB,
            insert: normalized,
          });
        }
      });

      if (changes.length === 0) return;

      update.view.dispatch({
        changes,
        userEvent: "input",
        annotations: INTERNAL_CHANGE.of(true),
      });
    }),
  ];
}

export default class AutoEnglishPunctuationPlugin extends Plugin {
  settings: AutoEnglishPunctuationSettings;
  private editorExtensions: Extension[] = [];

  async onload() {
    await this.loadSettings();

    // 用可变数组注册，后续改设置时可热更新
    this.registerEditorExtension(this.editorExtensions);
    this.refreshEditorExtension();

    this.addSettingTab(new AutoEnglishPunctuationSettingTab(this.app, this));
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<AutoEnglishPunctuationSettings> | null;

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      punctuationMap:
        data?.punctuationMap === undefined
          ? { ...DEFAULT_SETTINGS.punctuationMap }
          : sanitizePunctuationMap(data.punctuationMap),
    };
  }

  async saveSettings() {
    this.settings.punctuationMap = sanitizePunctuationMap(
      this.settings.punctuationMap,
    );

    await this.saveData(this.settings);
    this.refreshEditorExtension();
  }

  async onExternalSettingsChange() {
    await this.loadSettings();
    this.refreshEditorExtension();
  }

  private refreshEditorExtension() {
    this.editorExtensions.length = 0;
    this.editorExtensions.push(
      buildPunctuationExtension(this.settings.punctuationMap),
    );

    this.app.workspace.updateOptions();
  }
}