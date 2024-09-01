import { Component, FormEvent } from "inferno";
import { BITMAP_SIZE, BitmapClient, CHUNK_COUNT, CHUNK_SIZE } from "../client";
import { applyTheme, getCurrentTheme, themes } from "../utils";
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
			this.setState({ error: `Out of range. Must be between 0 and ${BITMAP_SIZE}` });
		}
	}

	render(props: GoToCheckboxFormProps, state: GoToCheckboxFormState) {
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

class ThemePicker extends Component<{}, ThemePickerState> {
	constructor(props: {}) {
		super(props);

		this.state = {
			theme: getCurrentTheme(),
		};
	}

	setTheme(theme: string): void {
		applyTheme(theme);
		this.setState({ theme });
	}

	render(_props: {}, state: ThemePickerState) {
		return (
			<div className="flex gap-2">
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

interface OverlayProps {
	client: BitmapClient;
	close: () => void;
}

class Overlay extends Component<OverlayProps> {
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

					<p>
						A stupid project by <a href="https://github.com/alula">Alula</a>
					</p>

					<p>
						Inspired by One Million Checkboxes by <a href="https://x.com/itseieio">@itseieio</a>, but with
						around 1073x more checkboxes!
					</p>

					<p>
						<a href="https://github.com/alula/bitmap">Source code</a>
						{" | "}
						<a href="/proto-docs">Protocol documentation</a>
					</p>
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
}

export class Header extends Component<HeaderProps> {
	constructor(props: HeaderProps) {
		super(props);

		this.state = {
			menuOpen: false,
		};
	}

	onPageChange(value: number): void {
		value = value - 1;

		this.props.client.setChunkIndex(value);
		this.forceUpdate();
	}

	setOpen(open: boolean): void {
		this.setState({ menuOpen: open });
	}

	render(props: HeaderProps, state: HeaderState) {
		const page = props.client.chunkIndex + 1;
		const start = props.client.chunkIndex * CHUNK_SIZE;
		const end = start + CHUNK_SIZE;

		return (
			<>
				<div className="header">
					<div className="title">
						<div className="t1b">1 billion checkboxes</div>
						<div className="t1e3">1024³ (64⁵) checkboxes</div>
					</div>

					<button className="btn btn-primary" onClick={() => this.setOpen(true)}>
						Menu
					</button>

					<div className={"header-page"}>
						<span>
							Page {page} of {CHUNK_COUNT}
						</span>
						<span className="mb-1 small">
							Checkboxes {start} to {end}
						</span>
						<Spinner
							value={props.client.chunkIndex + 1}
							onChange={(v) => this.onPageChange(v)}
							min={1}
							max={CHUNK_COUNT}
						/>
					</div>
				</div>
				{state.menuOpen && <Overlay client={props.client} close={() => this.setOpen(false)} />}
			</>
		);
	}
}
