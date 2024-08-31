import { elementScroll, observeElementOffset, observeElementRect, Virtualizer } from "@tanstack/virtual-core";
import { Component, createRef, InfernoNode, RefObject } from "inferno";
import { BitmapClient } from "./client";

const CHECKBOX_SIZE = 32;
const size = `${CHECKBOX_SIZE}px`;

function dummy() {}

interface CheckboxRowProps {
	index: number;
	count: number;
	itemsPerRow: number;
	client: BitmapClient;
}

class CheckboxRow extends Component<CheckboxRowProps, {}> {
	private checkboxRefs: Array<RefObject<HTMLInputElement>>;

	constructor(props: CheckboxRowProps) {
		super(props);

		this.checkboxRefs = [...Array(props.count)].map(() => createRef());
		this.bitmapChanged = this.bitmapChanged.bind(this);
	}

	componentWillReceiveProps(nextProps: Readonly<{ children?: InfernoNode } & CheckboxRowProps>): void {
		if (this.props.count !== nextProps.count) {
			this.checkboxRefs = [...Array(nextProps.count)].map(() => createRef());
		}
	}

	bitmapChanged(): void {
		this.checkboxRefs.forEach((ref, i) => {
			const idx = this.props.index + i;
			if (ref.current) {
				ref.current.checked = this.props.client.bitmap.get(idx);
			}
		});
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

	render(): InfernoNode {
		return (
			<div
				className="checkbox-row"
				style={{
					display: "flex",
					width: `${this.props.itemsPerRow * CHECKBOX_SIZE}px`,
				}}
			>
				{[...Array(this.props.count)].map((_, i) => {
					const idx = this.props.index + i;
					return (
						<div
							className="checkbox"
							style={{
								width: size,
								height: size,
							}}
						>
							<input
								type="checkbox"
								onChange={() => this.onChange(idx)}
								ref={this.checkboxRefs[i]}
								checked={this.props.client.bitmap.get(idx)}
							/>
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

export class CheckboxGrid extends Component<CheckboxGridProps> {
	private ref: RefObject<HTMLDivElement>;
	private itemsPerRow: number;
	private virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
	private cleanup: () => void = dummy;
	private resizeObserver: ResizeObserver | null = null;

	constructor(props: CheckboxGridProps) {
		super(props);

		this.ref = createRef();
		this.itemsPerRow = 20;
		this.virtualizer = new Virtualizer({
			count: Math.ceil(props.client.bitmap.bitCount / this.itemsPerRow),
			estimateSize: () => CHECKBOX_SIZE,
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

	componentDidMount(): void {
		this.updateSize();
		this.resizeObserver = new ResizeObserver(this.updateSize);
		this.resizeObserver.observe(this.ref.current!);
		this.cleanup = this.virtualizer._didMount();
		this.virtualizer._willUpdate();
	}

	componentWillUpdate(): void {
		this.virtualizer._willUpdate();
	}

	componentWillUnmount(): void {
		this.cleanup();
		this.resizeObserver?.disconnect();
	}

	updateSize(): void {
		if (!this.ref.current) return;

		const bitmap = this.props.client.bitmap;
		const width = this.ref.current.clientWidth;
		const newItemsPerRow = Math.floor(width / CHECKBOX_SIZE);

		if (newItemsPerRow === this.itemsPerRow) return;

		this.itemsPerRow = newItemsPerRow;
		this.virtualizer.setOptions({
			...this.virtualizer.options,
			count: Math.ceil(bitmap.bitCount / this.itemsPerRow),
		});

		this.forceUpdate();
	}

	getCount(index: number): number {
		const bitmap = this.props.client.bitmap;
		return Math.max(Math.min(this.itemsPerRow, bitmap.bitCount - index), 0);
	}

	render() {
		return (
			<div
				ref={this.ref}
				style={{
					height: "90vh",
					overflow: "auto",
				}}
			>
				<div
					style={{
						height: `${this.virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
					$HasKeyedChildren
				>
					{this.virtualizer.getVirtualItems().map((virtualItem) => {
						const baseIdx = virtualItem.index * this.itemsPerRow;
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
									index={baseIdx}
									count={this.getCount(baseIdx)}
									itemsPerRow={this.itemsPerRow}
									client={this.props.client}
								/>
							</div>
						);
					})}
				</div>
			</div>
		);
	}
}
