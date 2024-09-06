import { renderApp } from "./App";

export class Observable<T> {
	#value: T;
	#listeners: Set<(value: T) => void>;

	constructor(value: T) {
		this.#value = value;
		this.#listeners = new Set();
	}

	get value(): T {
		return this.#value;
	}

	set value(value: T) {
		this.#value = value;
		this.#listeners.forEach((listener) => listener(value));
	}

	subscribe(listener: (value: T) => void): void {
		this.#listeners.add(listener);
		listener(this.#value);
	}

	unsubscribe(listener: (value: T) => void): void {
		this.#listeners.delete(listener);
	}
}

const themeStorageKey = "1bcb__theme";
const debugStorageKey = "1bcb__debug";
const preferencesStorageKey = "1bcb__preferences";

export const themes = [
	{ id: "ctp-mocha", label: "Catppuccin Dark" },
	{ id: "ctp-latte", label: "Catppuccin Light" },
];

const defaultTheme = themes[0].id;

export function applyTheme(theme: string): void {
	const classList = document.querySelector("html")!.classList;
	classList.remove(...themes.map((t) => `style-${t.id}`));
	classList.add(`style-${theme}`);

	localStorage.setItem(themeStorageKey, theme);
}

export function getCurrentTheme(): string {
	return localStorage.getItem(themeStorageKey) || defaultTheme;
}

export function applyThemeFromStorage(): void {
	applyTheme(getCurrentTheme());
}

export function getAllPreferences(): { [key: string]: unknown } {
    const preferences = localStorage.getItem(preferencesStorageKey) || "{}";
    return JSON.parse(preferences);
}

export function getPreference(key: string): unknown {

    const preferences = getAllPreferences();
    const foundItem = preferences[key];
    if (typeof foundItem === 'undefined') return null;
    return foundItem;
}

export function setPreference( key: string, value: unknown, renderImmediate: boolean = true ): void {
    const preferences = getAllPreferences();
    preferences[key] = value;
    localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    if (renderImmediate) renderApp();
}

export function setCheckboxStylePreference(preference: string): void {
    setPreference('checkboxStyle', preference);
}

export function getCheckboxStylePreference(): string {
    const style = getPreference("checkboxStyle");
    if (typeof style !== 'string' || style === '') return "default"
    return style;
}

export function setTickMarkBorderVisible(hasBorder: boolean): void {
    setPreference("tickMarkBorderVisible", hasBorder);
}
export function getTickMarkBorderVisible(): boolean {
    const visible = getPreference("tickMarkBorderVisible")
    if (typeof visible !== 'boolean') return true
    return visible;
}

export function setTickMarkVisible(hasTick: boolean): void {
    setPreference("tickMarkVisible", hasTick);
}

export function getTickMarkVisible(): boolean {
    const visible = getPreference("tickMarkVisible")
    if (typeof visible !== 'boolean') return true
    return visible;
}

export const debug = new Observable(typeof window !== "undefined" && localStorage.getItem(debugStorageKey) === "true");

if (typeof window !== "undefined") {
	debug.subscribe((value) => {
		if (value) {
			localStorage.setItem(debugStorageKey, "true");
		} else {
			localStorage.removeItem(debugStorageKey);
		}
	});
}

export function downloadUint8Array(data: Uint8Array, filename: string): void {
	const blob = new Blob([data], { type: "application/octet-stream" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;

	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
