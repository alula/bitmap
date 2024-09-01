import { PageContext } from "vike/types";

export async function onRenderClient(pageContext: PageContext) {
	pageContext.Page.renderClient?.();
}
