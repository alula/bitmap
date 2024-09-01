import { defineConfig } from "vite";
import mdPlugin, { Mode } from "vite-plugin-markdown";
import inferno from "vite-plugin-inferno";
import vike from "vike/plugin";
import markdownIt from "markdown-it";
import markdownItPrism from "markdown-it-prism";

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		target: ["es2020", "edge88", "firefox78", "chrome87", "safari13"],
	},
	plugins: [
		mdPlugin({
			mode: [Mode.HTML],
			markdownIt: markdownIt({ html: true }).use(markdownItPrism),
		}),
		// @ts-ignore
		inferno(),
		vike({
			prerender: true,
		}),
	],
});
