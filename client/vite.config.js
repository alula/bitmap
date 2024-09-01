import { defineConfig } from "vite";
import mdPlugin, { Mode } from "vite-plugin-markdown";
import babel from "vite-plugin-babel";
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
		babel({
			babelConfig: {
				babelrc: false,
				configFile: false,

				sourceMaps: true,

				parserOpts: {
					plugins: [
						"importMeta",
						"topLevelAwait",
						"classProperties",
						"classPrivateProperties",
						"classPrivateMethods",
						"jsx",
						"typescript",
					],
					sourceType: "module",
					allowAwaitOutsideFunction: true,
				},

				generatorOpts: {
					decoratorsBeforeExport: true,
				},

				plugins: ["@babel/plugin-transform-react-jsx", "babel-plugin-inferno"],
			},
			exclude: "node_modules",
			filter: /\.[tj]sx?|html$/,
		}),
		vike({
			prerender: true,
		}),
	],
});
