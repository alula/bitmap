import { renderApp } from "../../src/App";
import "../../src/style/style.css";

function renderHTML() {
	return `
<!doctype html>
<html class="style-ctp-mocha">
	<head>
		<meta charset="UTF-8" />
		<!-- <link rel="icon" type="image/svg+xml" href="favicon.svg" /> -->
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>1 billion checkboxes</title>

		<meta property="og:title" content="1 billion checkboxes" />
		<meta property="og:description" content="1024³ (64⁵) checkboxes. 128 MiB bitmap. Come over and check all the billion boxes!" />
		<meta property="theme-color" content="#fe640b" />
	</head>
	<body>
		<div id="app"></div>
	</body>
</html>
`;
}

function renderClient() {
	renderApp();
}

export default {
	renderHTML,
	renderClient,
};
