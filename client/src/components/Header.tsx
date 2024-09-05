import { Component, FormEvent } from "inferno";
import { BITMAP_SIZE, BitmapClient, CHUNK_COUNT, CHUNK_SIZE } from "../client";
import { applyTheme, downloadUint8Array, getCurrentTheme, debug, themes, getCheckboxStylePreference, setCheckboxStylePreference, getTickMarkVisible, setTickMarkVisible } from "../utils";
import { Spinner } from "./Spinner";

interface GoToCheckboxFormProps {
	client: BitmapClient;
	close: () => void;
}

interface GoToCheckboxFormState {
	error: string;
}

class GoToCheckboxForm extends Component<GoToCheckboxFormProps, GoToCheckboxFormState> {
	constructor(props: GoToCheckboxFormProps) {
		super(props);

		this.state = {
			error: "",
		};
	}

	onSubmit(e: FormEvent<HTMLFormElement>): void {
		e.preventDefault();

		const el = e.currentTarget.elements.namedItem("num") as HTMLInputElement;
		const num = parseInt(el.value);

		if (isNaN(num)) {
			this.setState({ error: "Invalid number" });
			return;
		}

		if (num >= 0 && num < BITMAP_SIZE) {
			console.log("Going to checkbox", num);
			this.props.client.goToCheckboxCallback(num);
			this.props.close();
		} else {
			this.setState({ error: `Out of range. Must be between 0 and ${BITMAP_SIZE - 1}` });
		}
	}

	render(_props: GoToCheckboxFormProps, state: GoToCheckboxFormState) {
		return (
			<>
				<div className="flex gap-2 ai-center mb-2">
					<b>Go to checkbox:</b>

					<form className="fused-input" onSubmit={(e) => this.onSubmit(e)}>
						<input className="input" name="num" />
						<button className="btn btn-primary" formAction="submit">
							Go
						</button>
					</form>
				</div>
				{state.error && <div className="alert-error">{state.error}</div>}
			</>
		);
	}
}

interface ThemePickerState {
	theme: string;
}

class ThemePicker extends Component<object, ThemePickerState> {
	constructor(props: object) {
		super(props);

		this.state = {
			theme: getCurrentTheme(),
		};
	}

	setTheme(theme: string): void {
		applyTheme(theme);
		this.setState({ theme });
	}

	render(_props: object, state: ThemePickerState) {
		return (
			<div className="flex gap-2 mb-2">
				<b>Theme:</b>
				<select
					className="select"
					value={state.theme}
					onChange={(e) => this.setTheme(e.target.value)}
					$HasNonKeyedChildren
				>
					{themes.map((theme) => (
						<option value={theme.id}>{theme.label}</option>
					))}
				</select>
			</div>
		);
	}
}

interface CheckboxStylePreferenceState {
    preference: string;
}

class CheckboxStylePreference extends Component<object, CheckboxStylePreferenceState> {
    constructor(props: object) {
		super(props);

		this.state = {
			preference: getCheckboxStylePreference(),
		};
	}

	setPreference(isChecked: boolean): void {

        const preference = (isChecked) ? "reduced" : "default";
        setCheckboxStylePreference( preference );
        this.setState({ preference });
	}

	render(_props: object, state: CheckboxStylePreferenceState) {
		return (
			<div className="flex gap-2 mb-2">
				<b>Reduced checkbox style:</b>
				<input
                    type="checkbox"
					value={state.preference}
					onChange={(e) => this.setPreference( e.target.checked )}
                    checked={this.state?.preference === "reduced"}
					$HasNonKeyedChildren
				>
					{themes.map((theme) => (
						<option value={theme.id}>{theme.label}</option>
					))}
				</input>
			</div>
		);
	}
}

interface TickMarkVisibilityState {
    hasTick: boolean;
}

class TickMarkVisibility extends Component<object, TickMarkVisibilityState> {
    constructor(props: object) {
		super(props);

		this.state = {
			hasTick: getTickMarkVisible(),
		};
	}

	setPreference(isChecked: boolean): void {

        const hasTick = !isChecked;
        setTickMarkVisible( hasTick );
        this.setState({ hasTick });
	}

	render(_props: object, state: TickMarkVisibilityState) {
		return (
			<div className="flex gap-2 mb-2">
				<b>Remove ticks (✔):</b>
				<input
                    type="checkbox"
					value={state.hasTick.toString()}
					onChange={(e) => this.setPreference( e.target.checked )}
                    checked={!this.state?.hasTick}
					$HasNonKeyedChildren
				>
					{themes.map((theme) => (
						<option value={theme.id}>{theme.label}</option>
					))}
				</input>
			</div>
		);
	}
}

interface OverlayProps {
	client: BitmapClient;
	close: () => void;
}

class Overlay extends Component<OverlayProps> {
	constructor(props: OverlayProps) {
		super(props);
	}

	#toggleDebug(): void {
		debug.value = !debug.value;
	}

	#downloadPage(): void {
		const data = this.props.client.getUint8Array();
		const filename = `state-${this.props.client.chunkIndex}.bin`;
		downloadUint8Array(data, filename);
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

	render(props: OverlayProps) {
		return (
			<div className="overlay" onClick={props.close}>
				<div className="overlay-content" onClick={(e) => e.stopPropagation()}>
					<div className="flex ai-center mb-2">
						<h1 className="flex-grow">1 billion checkboxes</h1>
						<button className="close-button" onClick={props.close} />
					</div>

					<GoToCheckboxForm client={props.client} close={props.close} />

					<ThemePicker />
                    <CheckboxStylePreference />
                    <TickMarkVisibility />

					<p>
						A stupid project by <a href="https://github.com/alula">Alula</a>
					</p>

					<p>
						Inspired by One Million Checkboxes by <a href="https://x.com/itseieio">@itseieio</a>, but with
						around 1073x more checkboxes!
					</p>

					<p>
						<a href="https://github.com/alula/bitmap" target="_blank">
							Source code
						</a>
						{" | "}
						<a href="/proto-docs" target="_blank">
							Protocol docs
						</a>
						{" | "}
						<a href="/changelog" target="_blank">
							Changelog
						</a>
						<span className="secret">
							{" | "}
							<a href="#" onClick={() => this.#toggleDebug()}>
								debug
							</a>
						</span>
					</p>

					{debug.value && (
						<div>
							you found the hidden debug menu!
							<button className="btn" onClick={() => this.#downloadPage()}>
								Dump state of current page to file
							</button>
						</div>
					)}
				</div>
			</div>
		);
	}
}

interface HeaderProps {
	client: BitmapClient;
}

interface HeaderState {
	menuOpen: boolean;
	currentClients: number;
	checkedCount: number;
}

export class Header extends Component<HeaderProps> {
	constructor(props: HeaderProps) {
		super(props);

		this.state = {
			menuOpen: false,
			currentClients: props.client.currentClients.value,
			checkedCount: props.client.checkedCount.value,
		};
	}

	componentDidMount(): void {
		const client = this.props.client;
		client.currentClients.subscribe(this.#onCurrentClientsChange);
		client.checkedCount.subscribe(this.#onCheckedCountChange);
	}

	componentWillUnmount(): void {
		const client = this.props.client;
		client.currentClients.unsubscribe(this.#onCurrentClientsChange);
		client.checkedCount.unsubscribe(this.#onCheckedCountChange);
	}

	#onPageChange = (value: number): void => {
		value = value - 1;

		this.props.client.setChunkIndex(value);
		this.forceUpdate();
	};

	#onCurrentClientsChange = (currentClients: number): void => {
		this.setState({ currentClients });
	};

	#onCheckedCountChange = (checkedCount: number): void => {
		this.setState({ checkedCount });
	};

	#setOpen(menuOpen: boolean): void {
		this.setState({ menuOpen });
	}

	render(props: HeaderProps, state: HeaderState) {
		const page = props.client.chunkIndex + 1;
		const start = props.client.chunkIndex * CHUNK_SIZE;
		const end = start + CHUNK_SIZE;

		return (
			<div className="header">
				<div className="header-inner">
					<div className="title">
						<div className="t1b">1 billion checkboxes</div>
						<div className="t1e3">1024³ (64⁵) checkboxes</div>
					</div>

					<div className="header-menu">
						<button className="btn btn-primary" onClick={() => this.#setOpen(true)}>
							Menu
						</button>

						<span>
							{state.currentClients} {state.currentClients === 1 ? "person" : "people"} online
						</span>

						<span className="small">{state.checkedCount} checked on this page</span>
					</div>

					<div className={"header-page"}>
						<span>
							Page {page} of {CHUNK_COUNT}
						</span>
						<span className="mb-1 small">
							Checkboxes {start} to {end}
						</span>
						<Spinner
							value={props.client.chunkIndex + 1}
							onChange={this.#onPageChange}
							min={1}
							max={CHUNK_COUNT}
						/>
					</div>
				</div>
				{state.menuOpen && <Overlay client={props.client} close={() => this.#setOpen(false)} />}
			</div>
		);
	}
}
