import { Component } from "inferno";

export class LoadingSpinner extends Component {
	render() {
		return (
			<div className="lds-default">
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
				<div />
			</div>
		);
	}
}
