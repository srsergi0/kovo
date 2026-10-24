/**
 * TypeScript type definitions for writing Xiaomi Vela UI in TSX (React-style).
 * These types are consumed by the IDE / tsc only; the runtime is the Vela VM.
 */

type CSSObject = Record<string, string | number>;

type VelaDirectives = {
  if?: boolean | string;
  elif?: boolean | string;
  else?: boolean;
  show?: boolean | string;
  for?: string;
  switch?: string;
  case?: string;
  default?: boolean;
};

type CommonProps = {
  id?: string;
  ref?: any;
  class?: string;
  className?: string;
  style?: string | CSSObject;
  disabled?: boolean;
  tid?: string;
  static?: boolean;
  key?: string | number;
  children?: any;
};

type TouchEvents = {
  onClick?: any;
  onclick?: any;
  onLongPress?: any;
  onlongpress?: any;
  onSwipe?: any;
  onswipe?: any;
  onTouchStart?: any;
  ontouchstart?: any;
  onTouchMove?: any;
  ontouchmove?: any;
  onTouchEnd?: any;
  ontouchend?: any;
  onTouchCancel?: any;
  ontouchcancel?: any;
};

type FormEvents = {
  onChange?: any;
  onchange?: any;
  onFocus?: any;
  onfocus?: any;
  onBlur?: any;
  onblur?: any;
};

type ScrollEvents = {
  onScroll?: any;
  onscroll?: any;
};

type VisibilityEvents = {
  onAppear?: any;
  onappear?: any;
  onDisappear?: any;
  ondisappear?: any;
};

type DivProps = CommonProps & VelaDirectives & TouchEvents & {
  clickable?: boolean;
};

type TextProps = CommonProps & VelaDirectives & {
  lines?: number;
};

type SpanProps = CommonProps & VelaDirectives & {};

type ImageProps = CommonProps & VelaDirectives & {
  src: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill";
};

type InputProps = CommonProps & VelaDirectives & TouchEvents & FormEvents & {
  type: "button" | "text" | "checkbox" | "radio" | "password";
  value?: string;
  checked?: boolean;
  name?: string;
  placeholder?: string;
  maxlength?: number;
};

type StackProps = CommonProps & VelaDirectives;
type ScrollProps = CommonProps & VelaDirectives & {
  "scroll-x"?: boolean;
  "scroll-y"?: boolean;
  "scroll-amount"?: number;
};
type SwiperProps = CommonProps & VelaDirectives & {
  index?: number;
  autoplay?: boolean;
  loop?: boolean;
  duration?: number;
};
type ListProps = CommonProps & VelaDirectives & {
  scrollpage?: boolean;
  cached?: number;
  scrollable?: boolean;
};
type ListItemProps = CommonProps & VelaDirectives & {
  type: string;
};
type SwitchProps = CommonProps & VelaDirectives & {
  checked?: boolean;
  showtext?: boolean;
  texton?: string;
  textoff?: string;
};
type SliderProps = CommonProps & VelaDirectives & {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
};
type PickerProps = CommonProps & VelaDirectives & {
  type: "text" | "time";
  range?: string[];
  selected?: number;
};
type ProgressProps = CommonProps & VelaDirectives & {
  type?: "linear" | "arc";
  percent?: number;
  "stroke-width"?: number;
  color?: string;
  "layer-color"?: string;
  "start-angle"?: string;
  "total-angle"?: string;
};
type MarqueeProps = CommonProps & VelaDirectives & {
  scrollamount?: number;
  loop?: boolean;
  delay?: number;
  text?: string;
};
type ChartProps = CommonProps & VelaDirectives & {
  type: "line" | "bar" | "pie";
  datasets?: unknown[];
  options?: unknown;
};
type QrcodeProps = CommonProps & VelaDirectives & {
  value: string;
  size?: number;
  bgcolor?: string;
  fgcolor?: string;
};
type BarcodeProps = CommonProps & VelaDirectives & {
  value: string;
  width?: number;
  height?: number;
  bgcolor?: string;
  fgcolor?: string;
};
type AnchorProps = CommonProps & VelaDirectives & {
  href: string;
  target?: string;
};
type ImageAnimatorProps = CommonProps & VelaDirectives & {
  images: string[];
  duration?: number;
  iterations?: number;
};
type RatingProps = CommonProps & VelaDirectives & {
  numstars?: number;
  rating?: number;
  starsize?: number;
};
type DialogProps = CommonProps & VelaDirectives & {
  "dialog-x"?: number;
  "dialog-y"?: number;
  width?: string;
  height?: string;
};
type PopupProps = CommonProps & VelaDirectives & {
  target?: string;
  placement?: string;
  offsetX?: number;
  offsetY?: number;
};
type RefreshProps = CommonProps & VelaDirectives & {
  refreshing?: boolean;
  "refresh-color"?: string;
  offset?: number;
};
type MenuProps = CommonProps & VelaDirectives & {
  type?: string;
  multiple?: boolean;
};

// React Hooks module
declare module 'kovo-ux' {
  export function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(initialValue?: T): { current: T };
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: any[]): void;
}

declare module 'react' {
  export function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(initialValue?: T): { current: T };
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: any[]): void;
  const React: any;
  export default React;
}

// Ambient declarations for Xiaomi Vela system modules
declare module '@system.vibrator' {
  export interface VibrateOptions {
    mode?: 'short' | 'long';
  }
  export function vibrate(options?: VibrateOptions): void;
  const vibrator: {
    vibrate(options?: VibrateOptions): void;
  };
  export default vibrator;
}

declare module '@system.router' {
  export function replace(options: { uri: string; params?: Record<string, any> }): void;
  export function push(options: { uri: string; params?: Record<string, any> }): void;
  export function back(): void;
  const router: {
    replace(options: { uri: string; params?: Record<string, any> }): void;
    push(options: { uri: string; params?: Record<string, any> }): void;
    back(): void;
  };
  export default router;
}

declare module '@system.prompt' {
  export function showToast(options: { message: string; duration?: number }): void;
  const prompt: {
    showToast(options: { message: string; duration?: number }): void;
  };
  export default prompt;
}

declare module '@system.*' {
  const sysModule: any;
  export default sysModule;
}

declare global {
  namespace JSX {
    interface Element {}
    interface ElementClass {}
    interface ElementAttributesProperty {
      props: {};
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements {
      div: DivProps;
      text: TextProps;
      image: ImageProps;
      input: InputProps;
      stack: StackProps;
      scroll: ScrollProps & ScrollEvents;
      swiper: SwiperProps;
      list: ListProps;
      "list-item": ListItemProps;
      switch: SwitchProps;
      slider: SliderProps;
      picker: PickerProps;
      progress: ProgressProps;
      marquee: MarqueeProps;
      chart: ChartProps;
      qrcode: QrcodeProps;
      barcode: BarcodeProps;
      a: AnchorProps & VisibilityEvents;
      span: SpanProps;
      "image-animator": ImageAnimatorProps;
      rating: RatingProps;
      dialog: DialogProps;
      popup: PopupProps;
      refresh: RefreshProps;
      menu: MenuProps;
      [elemName: string]: any;
    }
  }
}
