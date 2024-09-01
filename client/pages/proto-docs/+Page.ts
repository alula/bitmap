// @ts-ignore
import { html } from "../../../PROTOCOL.md";

import { applyThemeFromStorage } from "../../src/utils";
import "../../src/style/style.css";
import "../../src/style/markdown.css";

function renderHTML() {
	return `
<!doctype html>
<html class="style-ctp-mocha">
	<head>
		<meta charset="UTF-8" />
		<!-- <link rel="icon" type="image/svg+xml" href="favicon.svg" /> -->
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Protocol Documentation</title>
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
