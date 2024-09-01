import { Component, createRef, RefObject } from "inferno";

interface SpinnerProps {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
}

interface SpinnerState {
	value: number;
}

export class Spinner extends Component<SpinnerProps, SpinnerState> {
	private inputRef: RefObject<HTMLInputElement>;

	constructor(props: SpinnerProps) {
		super(props);

		this.inputRef = createRef();
		this.state = {
			value: props.value,
		};
	}

	setValue(value: number) {
		if (isNaN(value)) {
			value = 0;
		}

		if (this.props.min !== undefined && value < this.props.min) {
			value = this.props.min;
		}
		if (this.props.max !== undefined && value > this.props.max) {
			value = this.props.max;
		}

		const el = this.inputRef.current;
		if (el) el.value = value.toString();

		this.setState({ value });
		this.props.onChange(value);
	}

	componentWillReceiveProps(nextProps: SpinnerProps): void {
		if (nextProps.value !== this.props.value) {
			this.setState({ value: nextProps.value });
		}
	}

	render(props: SpinnerProps, state: SpinnerState) {
		return (
			<div className="fused-input spinner">
				<button
					onClick={() => this.setValue(state.value - 1)}
					className="btn"
					disabled={props.min !== undefined && state.value <= props.min}
				>
					{"<"}
				</button>
				<input
					ref={this.inputRef}
					type="number"
					defaultValue={state.value}
					min={props.min}
					max={props.max}
					onChange={(e) => this.setValue(parseInt(e.currentTarget.value))}
				/>
				<button
					onClick={() => this.setValue(state.value + 1)}
					className="btn"
					disabled={props.max !== undefined && state.value >= props.max}
				>
					{">"}
				</button>
			</div>
		);
	}
}
