import { Component, render } from "inferno";
import { CheckboxGrid } from "./components/CheckboxGrid";
import { BitmapClient } from "./client";
import { Header } from "./components/Header";
import { applyThemeFromStorage } from "./utils";

export class App extends Component<{}> {
	client: BitmapClient;

	constructor(props: {}) {
		super(props);

		this.client = new BitmapClient();
	}

	render() {
		return (
			<div>
				<Header client={this.client} />
				<CheckboxGrid client={this.client} />
			</div>
		);
	}
}

export const renderApp = () => {
	applyThemeFromStorage();
	render(<App />, document.getElementById("app"));
};
