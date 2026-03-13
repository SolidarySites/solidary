export const IMAGE_LOAD_SPINNER_ATTR = "data-image-load-spinner";
export const IMAGE_LOAD_SPINNER_HOST_CLASS = "image-load-spinner-host";
export const IMAGE_LOAD_SPINNER_OVERLAY_CLASS = "image-load-spinner-overlay";
export const IMAGE_LOAD_SPINNER_SVG_CLASS = "image-load-spinner-svg";
export const IMAGE_LOAD_SPINNER_TRACK_CLASS = "image-load-spinner-track";
export const IMAGE_LOAD_SPINNER_INDICATOR_CLASS = "image-load-spinner-indicator";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const createImageLoadSpinnerSvg = (document: Document) => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", IMAGE_LOAD_SPINNER_SVG_CLASS);

  const track = document.createElementNS(SVG_NAMESPACE, "circle");
  track.setAttribute("class", IMAGE_LOAD_SPINNER_TRACK_CLASS);
  track.setAttribute("cx", "12");
  track.setAttribute("cy", "12");
  track.setAttribute("r", "8.5");
  track.setAttribute("stroke-width", "2");
  svg.appendChild(track);

  const indicator = document.createElementNS(SVG_NAMESPACE, "path");
  indicator.setAttribute("class", IMAGE_LOAD_SPINNER_INDICATOR_CLASS);
  indicator.setAttribute("d", "M12 3.5a8.5 8.5 0 0 1 6.98 3.64");
  indicator.setAttribute("stroke-width", "2.4");
  indicator.setAttribute("stroke-linecap", "round");
  svg.appendChild(indicator);

  return svg;
};

export const mountImageLoadSpinner = (host: HTMLElement) => {
  host.classList.add(IMAGE_LOAD_SPINNER_HOST_CLASS);

  const spinner = host.ownerDocument.createElement("span");
  spinner.setAttribute(IMAGE_LOAD_SPINNER_ATTR, "true");
  spinner.setAttribute("aria-hidden", "true");
  spinner.className = IMAGE_LOAD_SPINNER_OVERLAY_CLASS;
  spinner.appendChild(createImageLoadSpinnerSvg(host.ownerDocument));

  const previousPosition = host.style.position;
  const shouldRestorePosition = !previousPosition;
  if (!previousPosition) {
    host.style.position = "relative";
  }

  host.appendChild(spinner);

  return () => {
    if (spinner.parentElement === host) {
      host.removeChild(spinner);
    }
    if (shouldRestorePosition) {
      host.style.removeProperty("position");
    }
    if (!host.querySelector(`[${IMAGE_LOAD_SPINNER_ATTR}="true"]`)) {
      host.classList.remove(IMAGE_LOAD_SPINNER_HOST_CLASS);
    }
  };
};
