import { Component, render } from "inferno";
import { CheckboxGrid } from "./CheckboxGrid";
import { Bitmap } from "./bitmap";
import { BitmapClient } from "./client";

export class App extends Component<{}> {
	bitmap: Bitmap;
	client: BitmapClient;

	constructor(props: {}) {
		super(props);

		this.bitmap = new Bitmap(1024 * 1024);
		this.client = new BitmapClient(this.bitmap);
	}

	render() {
		return (
			<div>
				<h1>checkboxes</h1>
				<CheckboxGrid client={this.client} />
			</div>
		);
	}
}

export const initApp = () => render(<App />, document.getElementById("app"));
