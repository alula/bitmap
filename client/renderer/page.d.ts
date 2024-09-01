import type { PageContext } from "vike";

interface IPage {
	renderHTML: () => string;
	renderClient?: () => void;
}

declare global {
	namespace Vike {
		interface PageContext {
			Page: IPage;
		}

		interface Config {
			Page: IPage;
		}
	}
}

type PageContext_ = PageContext;

declare module "*.md" {
	const content: string;
	export const html: string;
	export default content;
}
