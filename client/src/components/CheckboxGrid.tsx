import { elementScroll, observeElementOffset, observeElementRect, Virtualizer } from "@tanstack/virtual-core";
import { Component, createRef, InfernoNode, RefObject } from "inferno";
import { BitmapClient, CHUNK_SIZE } from "../client";

const CHECKBOX_SIZE = 30;

function dummy() {}

interface CheckboxRowProps {
	index: number;
	count: number;
	itemsPerRow: number;
	checkboxSize: number;
	client: BitmapClient;
}

class CheckboxRow extends Component<CheckboxRowProps> {
	private checkboxRefs: Array<RefObject<HTMLInputElement>>;

	constructor(props: CheckboxRowProps) {
		super(props);

		this.checkboxRefs = [...Array(props.count)].map(() => createRef());
		this.bitmapChanged = this.bitmapChanged.bind(this);
	}

	componentWillReceiveProps(nextProps: CheckboxRowProps): void {
		if (
			this.props.count !== nextProps.count ||
			this.props.index !== nextProps.index ||
			this.props.checkboxSize !== nextProps.checkboxSize
		) {
			this.checkboxRefs = [...Array(nextProps.count)].map(() => createRef());
			this.forceUpdate();
		}
	}

	bitmapChanged(min: number, max: number): void {
		const localIdx = this.props.index * this.props.itemsPerRow;
		const globalIdx = this.props.client.chunkIndex * CHUNK_SIZE + localIdx;

		if (!(max >= localIdx && min <= localIdx + this.props.itemsPerRow)) {
			return;
		}

		this.checkboxRefs.forEach((ref, i) => {
			const idx = globalIdx + i;
			if (ref.current) {
				ref.current.checked = this.props.client.isChecked(idx);
			}
		});

		// this.forceUpdate();
	}

	componentDidMount(): void {
		this.props.client.bitmap.subscribeToChanges(this.bitmapChanged);
	}

	componentWillUnmount(): void {
		this.props.client.bitmap.unsubscribeFromChanges(this.bitmapChanged);
	}

	onChange(idx: number): void {
		this.props.client.toggle(idx);
		this.forceUpdate();
	}

	render(props: CheckboxRowProps): InfernoNode {
		const baseIdx = props.client.chunkIndex * CHUNK_SIZE + props.index * props.itemsPerRow;

		return (
			<div
				className="checkbox-row"
				style={{
					display: "flex",
					width: `${props.itemsPerRow}em`,
				}}
				$HasNonKeyedChildren
			>
				{[...Array(props.count)].map((_, i) => {
					const idx = baseIdx + i;
					return (
						<div className="checkbox">
							<input
								type="checkbox"
								className={props.client.highlightedIndex === idx ? "highlighted" : undefined}
								onChange={() => this.onChange(idx)}
								ref={this.checkboxRefs[i]}
								checked={props.client.isChecked(idx)}
							/>
							{/* <span>
								{idx}
								<br />
								{props.client.isChecked(idx).toString()}
							</span> */}
						</div>
					);
				})}
			</div>
		);
	}
}

interface CheckboxGridProps {
	client: BitmapClient;
}

interface CheckboxGridState {
	itemsPerRow: number;
	checkboxSize: number;
}

export class CheckboxGrid extends Component<CheckboxGridProps, CheckboxGridState> {
	private ref: RefObject<HTMLDivElement>;
	private virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
	private cleanup: () => void = dummy;
	private resizeObserver: ResizeObserver | null = null;

	constructor(props: CheckboxGridProps) {
		super(props);

		this.ref = createRef();
		// this.itemsPerRow = 20;
		this.state = {
			itemsPerRow: Math.floor(window.innerWidth / CHECKBOX_SIZE),
			checkboxSize: CHECKBOX_SIZE,
		};
		this.virtualizer = new Virtualizer({
			count: Math.ceil(props.client.bitmap.bitCount / this.state.itemsPerRow),
			overscan: 10,
			estimateSize: () => this.state!.checkboxSize,
			getScrollElement: () => this.ref.current,
			observeElementOffset,
			observeElementRect,
			scrollToFn: elementScroll,
			onChange: () => {
				this.forceUpdate();
			},
		});

		this.updateSize = this.updateSize.bind(this);
	}

	goToCheckbox(index: number): void {
		const chunkIndex = Math.floor(index / CHUNK_SIZE);
		const bitIndex = index % CHUNK_SIZE;

		const y = Math.floor(bitIndex / this.state!.itemsPerRow);

		this.virtualizer.scrollToIndex(y, {
			align: "center",
			behavior: "smooth",
		});

		if (chunkIndex !== this.props.client.chunkIndex) {
			this.props.client.setChunkIndex(chunkIndex);
		}

		this.props.client.highlightedIndex = index;
		setTimeout(() => {
			this.props.client.highlightedIndex = -1;
		}, 5000);

		this.forceUpdate();
	}

	componentDidMount(): void {
		this.updateSize();
		this.resizeObserver = new ResizeObserver(this.updateSize);
		this.resizeObserver.observe(this.ref.current!);
		this.cleanup = this.virtualizer._didMount();
		this.virtualizer._willUpdate();
		this.props.client.goToCheckboxCallback = this.goToCheckbox.bind(this);
	}

	componentWillUpdate(): void {
		this.virtualizer._willUpdate();
	}

	componentWillUnmount(): void {
		this.cleanup();
		this.resizeObserver?.disconnect();
		this.props.client.goToCheckboxCallback = dummy;
	}

	updateSize(): void {
		const element = this.ref.current;
		if (!element) return;

		const bitmap = this.props.client.bitmap;
		const width = element.clientWidth;

		const checkboxSize = Math.max(Math.floor(width / 60), 21);
		const itemsPerRow = Math.max(1, Math.floor(width / checkboxSize));

		this.virtualizer.setOptions({
			...this.virtualizer.options,
			estimateSize: () => checkboxSize,
			count: Math.ceil(bitmap.bitCount / itemsPerRow),
		});

		this.setState({
			checkboxSize: checkboxSize,
			itemsPerRow: itemsPerRow,
		});

		this.virtualizer.resizeItem(0, checkboxSize);
	}

	getCount(index: number): number {
		const bitmap = this.props.client.bitmap;
		index %= bitmap.bitCount;
		return Math.max(Math.min(this.state!.itemsPerRow, bitmap.bitCount - index), 0);
	}

	render(props: CheckboxGridProps, state: CheckboxGridState) {
		return (
			<div ref={this.ref} className="checkbox-grid">
				<div
					style={{
						height: `${this.virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
						"font-size": `${state.checkboxSize}px`,
					}}
					$HasKeyedChildren
				>
					{this.virtualizer.getVirtualItems().map((virtualItem) => {
						return (
							<div
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: `${virtualItem.size}px`,
									transform: `translateY(${virtualItem.start}px)`,
									display: "flex",
									"justify-content": "center",
								}}
								key={virtualItem.index}
							>
								<CheckboxRow
									{...props}
									{...state}
									index={virtualItem.index}
									count={this.getCount(virtualItem.index * state.itemsPerRow)}
								/>
							</div>
						);
					})}
				</div>
			</div>
		);
	}
}
