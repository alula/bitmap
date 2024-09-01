const themeStorageKey = "theme";

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
