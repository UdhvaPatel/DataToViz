"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ChartErrorBoundary]", this.props.title, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {this.props.title ?? "Chart"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/30 bg-destructive/5">
              <AlertTriangle className="h-5 w-5 text-destructive/60" />
              <p className="text-xs text-muted-foreground">Failed to render</p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
