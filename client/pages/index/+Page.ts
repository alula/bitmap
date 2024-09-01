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
		<title>Bitmap</title>
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
