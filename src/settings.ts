import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AutoEnglishPunctuationPlugin from "./main";

export interface AutoEnglishPunctuationSettings {
  punctuationMap: Record<string, string>;
}

export const DEFAULT_SETTINGS: AutoEnglishPunctuationSettings = {
  punctuationMap: {
    "……": "...",
    "——": "--",
    "，": ",",
    "。": ".",
    "！": "!",
    "？": "?",
    "；": ";",
    "：": ":",
    "（": "(",
    "）": ")",
    "【": "[",
    "】": "]",
    "《": "<",
    "》": ">",
    "、": ",",
    "“": "\"",
    "”": "\"",
    "‘": "'",
    "’": "'",
    "·": "`"
  },
};

export function sanitizePunctuationMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_SETTINGS.punctuationMap };
  }

  const result: Record<string, string> = {};
  const entries = Object.entries(input as Record<string, unknown>);

  for (const [from, to] of entries) {
    if (!from) continue;
    if (typeof to !== "string") continue;
    result[from] = to;
  }

  return result;
}

function parsePunctuationMap(text: string): Record<string, string> {
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("映射必须是 JSON 对象");
  }

  return sanitizePunctuationMap(parsed);
}

export class AutoEnglishPunctuationSettingTab extends PluginSettingTab {
  plugin: AutoEnglishPunctuationPlugin;
  private draft = "";

  constructor(app: App, plugin: AutoEnglishPunctuationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("自动中文标点转英文标点")
      .setHeading();
    containerEl.createEl("p", {
      text: "使用 JSON 对象配置映射：键是原字符，值是目标字符。支持单字符和多字符，例如 “……” -> “...” 。",
    });

    this.draft = JSON.stringify(this.plugin.settings.punctuationMap, null, 2);

    let textAreaEl: HTMLTextAreaElement | null = null;

    new Setting(containerEl)
      .setName("符号映射")
      .setDesc("修改后点击“保存映射”即可立即生效。")
      .addTextArea((text) => {
        text.setPlaceholder(
          '{\n  "，": ",",\n  "。": ".",\n  "！": "!",\n  "……": "..."\n}',
        );
        text.setValue(this.draft);

        text.inputEl.rows = 16;
		text.inputEl.addClass("auto-punctuation-setting-textarea");

        text.onChange((value) => {
          this.draft = value;
        });

        textAreaEl = text.inputEl;
      })
      .addButton((btn) => {
        btn.setButtonText("保存映射");
        btn.setCta();
        btn.onClick(async () => {
          try {
            this.plugin.settings.punctuationMap = parsePunctuationMap(this.draft);
            await this.plugin.saveSettings();
            new Notice("标点映射已保存");
            this.display();
          } catch (e) {
            console.error(e);
            new Notice("映射格式无效，请输入合法 JSON 对象");
            textAreaEl?.focus();
          }
        });
      })
      .addButton((btn) => {
        btn.setButtonText("恢复默认");
        btn.onClick(async () => {
          this.plugin.settings.punctuationMap = {
            ...DEFAULT_SETTINGS.punctuationMap,
          };
          await this.plugin.saveSettings();
          new Notice("已恢复默认映射");
          this.display();
        });
      });
  }
}