import { dangerouslySkipEscape, escapeInject } from "vike/server";

export async function onRenderHtml(pageContext: Vike.PageContext) {
	const { Page } = pageContext;
	const pageHtml = Page.renderHTML();
	return escapeInject`${dangerouslySkipEscape(pageHtml)}`;
}
