const themeStorageKey = "1bcb__theme";
const debugStorageKey = "1bcb__debug";

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

let debug = typeof window !== "undefined" && localStorage.getItem(debugStorageKey) === "true";

export function setDebug(value: boolean): void {
	debug = value;
	if (value) {
		localStorage.setItem(debugStorageKey, "true");
	} else {
		localStorage.removeItem(debugStorageKey);
	}
}

export function isDebug(): boolean {
	return debug;
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
