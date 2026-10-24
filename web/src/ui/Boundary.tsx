// If something unexpected breaks a page, show the standard error screen instead of nothing.
import { Component, type ReactNode } from "react";
import { HanditError } from "../core/codes";
import { strings } from "../strings";
import { ErrorView } from "./ErrorView";
import { Button } from "./parts";

export class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <ErrorView error={new HanditError("UNKNOWN_ERROR", String(this.state.error))}>
        <Button onClick={() => location.assign("/")}>{strings.actions.home}</Button>
      </ErrorView>
    );
  }
}
