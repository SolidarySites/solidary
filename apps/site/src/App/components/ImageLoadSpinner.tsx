import {
  IMAGE_LOAD_SPINNER_ATTR,
  IMAGE_LOAD_SPINNER_INDICATOR_CLASS,
  IMAGE_LOAD_SPINNER_OVERLAY_CLASS,
  IMAGE_LOAD_SPINNER_SVG_CLASS,
  IMAGE_LOAD_SPINNER_TRACK_CLASS
} from "../lib/image-load-spinner";

export function ImageLoadSpinner() {
  return (
    <span
      className={IMAGE_LOAD_SPINNER_OVERLAY_CLASS}
      aria-hidden="true"
      {...{ [IMAGE_LOAD_SPINNER_ATTR]: "true" }}
    >
      <svg className={IMAGE_LOAD_SPINNER_SVG_CLASS} viewBox="0 0 24 24" fill="none">
        <circle
          className={IMAGE_LOAD_SPINNER_TRACK_CLASS}
          cx="12"
          cy="12"
          r="8.5"
          strokeWidth="2"
        />
        <path
          className={IMAGE_LOAD_SPINNER_INDICATOR_CLASS}
          d="M12 3.5a8.5 8.5 0 0 1 6.98 3.64"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
