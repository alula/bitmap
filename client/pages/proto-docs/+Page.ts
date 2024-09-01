// @ts-ignore
import { html } from "../../../PROTOCOL.md";

import { applyThemeFromStorage } from "../../src/utils";

function renderHTML() {
	return `
<!doctype html>
<html class="style-ctp-mocha">
	<head>
		<meta charset="UTF-8" />
		<!-- <link rel="icon" type="image/svg+xml" href="favicon.svg" /> -->
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Protocol Documentation</title>
		<link rel="stylesheet" href="/src/style/style.css" />
		<link rel="stylesheet" href="/src/style/markdown.css" />
	</head>
	<body>
		<div id="markdown">
			${html}
		</div>
	</body>
</html>
`;
}

function renderClient() {
	applyThemeFromStorage();
}

export default {
	renderHTML,
	renderClient,
};
