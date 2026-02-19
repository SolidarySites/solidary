const TINY_SVG_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(31,34,28,0.2)" stroke-width="2"/><path d="M12 3a9 9 0 0 1 7.8 4.5" stroke="rgba(31,34,28,0.65)" stroke-width="2" stroke-linecap="round"/></svg>`

export const EXTERNAL_IMAGE_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(TINY_SVG_PLACEHOLDER)}`
export const EXTERNAL_IMAGE_SOURCE_ATTR = "data-external-image-src"
export const EXTERNAL_IMAGE_STATE_ATTR = "data-external-image-state"
export const EXTERNAL_IMAGE_CONTAINER_ATTR = "data-external-image-container"

const EXTERNAL_IMAGE_TOKEN_ATTR = "data-external-image-token"
const BUILDER_IMAGE_FIGURE_SELECTOR = 'figure[data-builder-image-figure="true"]'

type ExternalImageState = "loading" | "loaded" | "error"

const getBuilderImageFigure = (image: Element) => image.closest(BUILDER_IMAGE_FIGURE_SELECTOR)
const getExternalImageContainer = (image: Element) =>
  image.closest(`[${EXTERNAL_IMAGE_CONTAINER_ATTR}="true"]`)

const setExternalImageState = (image: HTMLImageElement, state: ExternalImageState | null) => {
  if (state) {
    image.setAttribute(EXTERNAL_IMAGE_STATE_ATTR, state)
  } else {
    image.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  }

  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) {
    if (state) {
      figure.setAttribute(EXTERNAL_IMAGE_STATE_ATTR, state)
    } else {
      figure.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
    }
  }

  const container = getExternalImageContainer(image)
  if (container instanceof HTMLElement) {
    if (state) {
      container.setAttribute(EXTERNAL_IMAGE_STATE_ATTR, state)
    } else {
      container.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
    }
  }
}

export const isExternalImageSource = (value: string) => {
  const source = value.trim()
  if (!source) return false

  const lower = source.toLowerCase()
  if (
    lower.startsWith("blob:") ||
    lower.startsWith("data:") ||
    lower.startsWith("about:") ||
    lower.startsWith("file:")
  ) {
    return false
  }

  if (source.startsWith("//")) return true
  if (lower.startsWith("http://") || lower.startsWith("https://")) return true
  if (source.startsWith("/solidary-media/") || source.startsWith("/images/uploads/")) return true
  return false
}

export const getTrackedExternalImageSource = (image: Element) => {
  const trackedSource = image.getAttribute(EXTERNAL_IMAGE_SOURCE_ATTR)?.trim() ?? ""
  const currentSource = image.getAttribute("src")?.trim() ?? ""

  if (currentSource && currentSource !== EXTERNAL_IMAGE_PLACEHOLDER_SRC) {
    if (!trackedSource || trackedSource !== currentSource) {
      return currentSource
    }
  }

  if (trackedSource) return trackedSource
  return currentSource
}

export const clearExternalImageTracking = (image: HTMLImageElement) => {
  image.removeAttribute(EXTERNAL_IMAGE_SOURCE_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)

  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) {
    figure.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  }

  const container = getExternalImageContainer(image)
  if (container instanceof HTMLElement) {
    container.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  }
}

export const startExternalImageLoadWithPlaceholder = (
  image: HTMLImageElement,
  source: string
) => {
  const targetSource = source.trim()
  if (!isExternalImageSource(targetSource)) {
    clearExternalImageTracking(image)
    return () => {}
  }

  image.setAttribute(EXTERNAL_IMAGE_SOURCE_ATTR, targetSource)

  if (image.getAttribute("src") === targetSource && image.complete && image.naturalWidth > 0) {
    setExternalImageState(image, "loaded")
    return () => {}
  }

  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  image.setAttribute(EXTERNAL_IMAGE_TOKEN_ATTR, token)
  setExternalImageState(image, "loading")
  image.setAttribute("src", EXTERNAL_IMAGE_PLACEHOLDER_SRC)

  const loader = new Image()
  let cancelled = false
  let removeRevealListeners: (() => void) | null = null

  const clearRevealListeners = () => {
    if (!removeRevealListeners) return
    removeRevealListeners()
    removeRevealListeners = null
  }

  const revealSource = (state: ExternalImageState) => {
    if (cancelled) return
    if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return

    const onImageReady = () => {
      if (cancelled) return
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return

      clearRevealListeners()
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)
      setExternalImageState(image, state)
    }

    image.addEventListener("load", onImageReady)
    image.addEventListener("error", onImageReady)
    removeRevealListeners = () => {
      image.removeEventListener("load", onImageReady)
      image.removeEventListener("error", onImageReady)
    }

    image.setAttribute("src", targetSource)

    if (image.complete && (image.naturalWidth > 0 || state === "error")) {
      onImageReady()
    }
  }

  loader.onload = () => {
    revealSource("loaded")
  }

  loader.onerror = () => {
    revealSource("error")
  }

  loader.src = targetSource

  return () => {
    cancelled = true
    loader.onload = null
    loader.onerror = null
    clearRevealListeners()

    if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) === token) {
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)
      setExternalImageState(image, null)
    }
  }
}

export const normalizeExternalImageForPersistence = (image: Element) => {
  const source = getTrackedExternalImageSource(image)
  if (source) {
    image.setAttribute("src", source)
  }

  image.removeAttribute(EXTERNAL_IMAGE_SOURCE_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)

  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) {
    figure.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  }

  const container = getExternalImageContainer(image)
  if (container instanceof HTMLElement) {
    container.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  }
}
