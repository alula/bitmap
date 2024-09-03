import { Component, render } from "inferno";
import { CheckboxGrid } from "./components/CheckboxGrid";
import { BitmapClient } from "./client";
import { Header } from "./components/Header";
import { applyThemeFromStorage, debug } from "./utils";
import { LoadingSpinner } from "./components/Loading";
import { NekoComponent } from "./components/Neko";

interface AppState {
	loading: boolean;
}

export class App extends Component<object> {
	client: BitmapClient;

	constructor(props: object) {
		super(props);

		this.state = {
			loading: true,
		};

		this.client = new BitmapClient();
		this.client.loadingCallback = (loading: boolean) => this.setState({ loading });
	}

	#onDebugChange = () => {
		this.forceUpdate();
	};

	componentDidMount(): void {
		debug.subscribe(this.#onDebugChange);
	}

	componentWillUnmount(): void {
		debug.unsubscribe(this.#onDebugChange);
	}

	render(_props: object, { loading }: AppState) {
		return (
			<main>
				<Header client={this.client} />
				<CheckboxGrid client={this.client} />
				{loading && (
					<div className="loading-overlay" $HasVNodeChildren>
						<LoadingSpinner />
						<span>Connecting</span>
					</div>
				)}
				{debug.value && <NekoComponent />}
			</main>
		);
	}
}

export const renderApp = () => {
	applyThemeFromStorage();
	render(<App />, document.getElementById("app"));
};
