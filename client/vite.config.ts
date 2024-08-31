import { defineConfig } from "vite";
import mdPlugin from "vite-plugin-markdown";
import inferno from "vite-plugin-inferno";

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		target: ["es2020", "edge88", "firefox78", "chrome87", "safari13"],
	},
	plugins: [
		mdPlugin(),
		// @ts-ignore
		inferno(),
	],
});
