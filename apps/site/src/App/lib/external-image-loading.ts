import { getImageElementLoadState } from "./image-element-load-state"
import { mountImageLoadSpinner } from "./image-load-spinner"

const TINY_SVG_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(31,34,28,0.2)" stroke-width="2"/><path d="M12 3a9 9 0 0 1 7.8 4.5" stroke="rgba(31,34,28,0.65)" stroke-width="2" stroke-linecap="round"/></svg>`

export const EXTERNAL_IMAGE_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(TINY_SVG_PLACEHOLDER)}`
export const EXTERNAL_IMAGE_SOURCE_ATTR = "data-external-image-src"
export const EXTERNAL_IMAGE_STATE_ATTR = "data-external-image-state"
export const EXTERNAL_IMAGE_CONTAINER_ATTR = "data-external-image-container"
export const EXTERNAL_IMAGE_SKIP_ATTR = "data-skip-external-image-loading"
export const EXTERNAL_IMAGE_VARIANT_SMALL_ATTR = "data-external-image-src-small"
export const EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR = "data-external-image-src-medium"
export const EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR = "data-external-image-src-original"
export const BUILDER_IMAGE_ASPECT_RATIO_ATTR = "data-builder-image-aspect-ratio"

const EXTERNAL_IMAGE_TOKEN_ATTR = "data-external-image-token"
const BUILDER_IMAGE_FIGURE_SELECTOR = 'figure[data-builder-image-figure="true"]'
const EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR = "--external-image-placeholder-height"
const EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR = "--external-image-placeholder-width"
const EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR = "--external-image-placeholder-left"
const EXTERNAL_IMAGE_VARIANT_SMALL_TARGET_PX = 560
const EXTERNAL_IMAGE_VARIANT_MEDIUM_TARGET_PX = 1080

const EXTERNAL_IMAGE_DIMENSIONS_CACHE = new Map<string, { width: number; height: number }>()

type ExternalImageState = "loading" | "loaded" | "error"
type ExternalImageVariantSources = {
  original: string
  medium: string
  small: string
}

const getBuilderImageFigure = (image: Element) => image.closest(BUILDER_IMAGE_FIGURE_SELECTOR)
const getExternalImageContainer = (image: Element) =>
  image.closest(`[${EXTERNAL_IMAGE_CONTAINER_ATTR}="true"]`)
const getExternalImageSpinnerHost = (image: Element) => {
  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) return figure

  const container = getExternalImageContainer(image)
  if (container instanceof HTMLElement) return container

  return null
}

const parsePositiveNumber = (value: string | null | undefined) => {
  if (!value) return null
  const normalized = Number.parseFloat(value.trim())
  if (!Number.isFinite(normalized) || normalized <= 0) return null
  return normalized
}

const parsePercentWidth = (value: string | null | undefined) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.endsWith("%")) return null
  const parsed = Number.parseFloat(trimmed.slice(0, -1))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

const getImageDisplayWidthEstimate = (image: HTMLImageElement) => {
  const measuredImageWidth = image.getBoundingClientRect().width
  if (measuredImageWidth > 0) return measuredImageWidth

  const alignWrapper = image.closest('[data-builder-image-align-wrapper="true"]')
  if (alignWrapper instanceof HTMLElement) {
    const wrapperWidth = alignWrapper.getBoundingClientRect().width
    if (wrapperWidth > 0) {
      const percentageWidth =
        parsePercentWidth(image.style.width) ??
        parsePercentWidth(image.getAttribute("width"))
      if (percentageWidth) {
        return (wrapperWidth * percentageWidth) / 100
      }
      return wrapperWidth
    }
  }

  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) {
    const figureWidth = figure.getBoundingClientRect().width
    if (figureWidth > 0) return figureWidth
  }

  const container = getExternalImageContainer(image)
  if (container instanceof HTMLElement) {
    const containerWidth = container.getBoundingClientRect().width
    if (containerWidth > 0) return containerWidth
  }

  const widthAttribute = parsePositiveNumber(image.getAttribute("width"))
  return widthAttribute ?? 0
}

const getDevicePixelRatio = () => {
  if (typeof window === "undefined") return 1
  if (!Number.isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
    return 1
  }
  return window.devicePixelRatio
}

const getWindowInnerWidth = () => {
  if (typeof window === "undefined") return 1024
  if (!Number.isFinite(window.innerWidth) || window.innerWidth <= 0) return 1024
  return window.innerWidth
}

const getExternalImageVariantSources = (image: Element): ExternalImageVariantSources => ({
  original: image.getAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR)?.trim() ?? "",
  medium: image.getAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR)?.trim() ?? "",
  small: image.getAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR)?.trim() ?? ""
})

const collectUniqueSources = (sources: string[]) => {
  const uniqueSources: string[] = []
  const seen = new Set<string>()
  sources.forEach((source) => {
    const normalized = source.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    uniqueSources.push(normalized)
  })
  return uniqueSources
}

const resolveExternalImageLoadSource = (image: HTMLImageElement, fallbackSource: string) => {
  const variants = getExternalImageVariantSources(image)
  if (!variants.small && !variants.medium && !variants.original) {
    return fallbackSource
  }

  const estimatedDisplayWidth =
    getImageDisplayWidthEstimate(image) || Math.min(getWindowInnerWidth(), 1200)
  const targetDisplayPixels = estimatedDisplayWidth * getDevicePixelRatio()

  if (targetDisplayPixels <= EXTERNAL_IMAGE_VARIANT_SMALL_TARGET_PX) {
    return variants.small || variants.medium || variants.original || fallbackSource
  }

  if (targetDisplayPixels <= EXTERNAL_IMAGE_VARIANT_MEDIUM_TARGET_PX) {
    return variants.medium || variants.original || variants.small || fallbackSource
  }

  return variants.original || variants.medium || variants.small || fallbackSource
}

const resolveImageAspectRatio = (image: HTMLImageElement, sourceCandidates: string[]) => {
  const ratioFromMetadata = parsePositiveNumber(
    image.getAttribute(BUILDER_IMAGE_ASPECT_RATIO_ATTR)
  )
  if (ratioFromMetadata) {
    return ratioFromMetadata
  }

  const widthFromAttributes = parsePositiveNumber(image.getAttribute("width"))
  const heightFromAttributes = parsePositiveNumber(image.getAttribute("height"))
  if (widthFromAttributes && heightFromAttributes) {
    return widthFromAttributes / heightFromAttributes
  }

  for (const source of sourceCandidates) {
    const dimensions = EXTERNAL_IMAGE_DIMENSIONS_CACHE.get(source)
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) continue
    return dimensions.width / dimensions.height
  }

  return null
}

const getImagePlaceholderLeftOffset = ({
  image,
  placeholderWidth
}: {
  image: HTMLImageElement
  placeholderWidth: number
}) => {
  const alignWrapper = image.closest('[data-builder-image-align-wrapper="true"]')
  if (alignWrapper instanceof HTMLElement) {
    const wrapperWidth = alignWrapper.getBoundingClientRect().width
    if (wrapperWidth > 0) {
      const textAlign =
        (window.getComputedStyle(alignWrapper).textAlign || alignWrapper.style.textAlign || "")
          .trim()
          .toLowerCase()
      if (textAlign === "right" || textAlign === "end") {
        return Math.max(0, Math.round(wrapperWidth - placeholderWidth))
      }
      if (textAlign === "center") {
        return Math.max(0, Math.round((wrapperWidth - placeholderWidth) / 2))
      }
    }
    return 0
  }

  const figure = getBuilderImageFigure(image)
  if (!(figure instanceof HTMLElement)) return 0

  const figureRect = figure.getBoundingClientRect()
  const imageRect = image.getBoundingClientRect()
  if (figureRect.width <= 0 || imageRect.width <= 0) return 0
  return Math.max(0, Math.round(imageRect.left - figureRect.left))
}

const applyExternalImagePlaceholderSizing = (
  image: HTMLImageElement,
  sourceCandidates: string[]
) => {
  const figure = getBuilderImageFigure(image)
  if (!(figure instanceof HTMLElement)) return

  const width = getImageDisplayWidthEstimate(image)
  if (width <= 0) {
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR)
    return
  }

  const aspectRatio = resolveImageAspectRatio(image, sourceCandidates)
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR)
    return
  }

  const placeholderWidth = Math.max(1, Math.round(width))
  const placeholderLeft = getImagePlaceholderLeftOffset({
    image,
    placeholderWidth
  })
  const placeholderHeight = Math.max(72, Math.round(width / aspectRatio))
  figure.style.setProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR, `${placeholderWidth}px`)
  figure.style.setProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR, `${placeholderLeft}px`)
  figure.style.setProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR, `${placeholderHeight}px`)
  image.style.height = `${placeholderHeight}px`
}

const clearExternalImagePlaceholderSizing = (image: HTMLImageElement) => {
  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) {
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR)
  }
  image.style.height = "auto"
}

const cacheExternalImageDimensions = ({
  width,
  height,
  sources
}: {
  width: number
  height: number
  sources: string[]
}) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return
  }

  collectUniqueSources(sources).forEach((source) => {
    EXTERNAL_IMAGE_DIMENSIONS_CACHE.set(source, { width, height })
  })
}

const isManagedVariantSource = (image: Element, source: string) => {
  const normalizedSource = source.trim()
  if (!normalizedSource) return false

  const variants = getExternalImageVariantSources(image)
  return (
    variants.small === normalizedSource ||
    variants.medium === normalizedSource ||
    variants.original === normalizedSource
  )
}

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
  if (source.startsWith("/solidary-media/")) return true
  return false
}

export const getTrackedExternalImageSource = (image: Element) => {
  const trackedSource = image.getAttribute(EXTERNAL_IMAGE_SOURCE_ATTR)?.trim() ?? ""
  const currentSource = image.getAttribute("src")?.trim() ?? ""

  if (!currentSource || currentSource === EXTERNAL_IMAGE_PLACEHOLDER_SRC) {
    return trackedSource || currentSource
  }

  if (!trackedSource) return currentSource
  if (trackedSource === currentSource) return trackedSource
  if (isManagedVariantSource(image, currentSource)) {
    return trackedSource
  }

  return currentSource
}

export const clearExternalImageTracking = (image: HTMLImageElement) => {
  image.removeAttribute(EXTERNAL_IMAGE_SOURCE_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)
  clearExternalImagePlaceholderSizing(image)

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

  const loadSource = resolveExternalImageLoadSource(image, targetSource)
  const variantSources = getExternalImageVariantSources(image)
  const blurredPlaceholderSource =
    variantSources.small || variantSources.medium || variantSources.original || loadSource
  const placeholderCandidates = collectUniqueSources([
    targetSource,
    loadSource,
    variantSources.original,
    variantSources.medium,
    variantSources.small
  ])

  image.setAttribute(EXTERNAL_IMAGE_SOURCE_ATTR, targetSource)

  if (image.getAttribute("src") === loadSource && getImageElementLoadState(image) === "loaded") {
    cacheExternalImageDimensions({
      width: image.naturalWidth,
      height: image.naturalHeight,
      sources: placeholderCandidates
    })
    clearExternalImagePlaceholderSizing(image)
    setExternalImageState(image, "loaded")
    return () => {}
  }

  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const spinnerHost = getExternalImageSpinnerHost(image)
  const removeSpinner = spinnerHost ? mountImageLoadSpinner(spinnerHost) : null
  let spinnerRemoved = false
  const hideSpinner = () => {
    if (spinnerRemoved) return
    spinnerRemoved = true
    removeSpinner?.()
  }
  image.setAttribute(EXTERNAL_IMAGE_TOKEN_ATTR, token)
  const syncPlaceholderSizing = () => {
    if (cancelled) return
    if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return
    applyExternalImagePlaceholderSizing(image, placeholderCandidates)
  }
  let placeholderSizingFrameId: number | null = null
  const schedulePlaceholderSizingSync = () => {
    if (typeof window === "undefined") return
    if (placeholderSizingFrameId !== null) {
      window.cancelAnimationFrame(placeholderSizingFrameId)
    }
    placeholderSizingFrameId = window.requestAnimationFrame(() => {
      placeholderSizingFrameId = null
      syncPlaceholderSizing()
    })
  }
  const stopPlaceholderSizingSync = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", schedulePlaceholderSizingSync)
      if (placeholderSizingFrameId !== null) {
        window.cancelAnimationFrame(placeholderSizingFrameId)
        placeholderSizingFrameId = null
      }
    }
  }

  let cancelled = false
  syncPlaceholderSizing()
  schedulePlaceholderSizingSync()
  if (typeof window !== "undefined") {
    window.addEventListener("resize", schedulePlaceholderSizingSync)
  }

  const loader = new Image()
  let removeRevealListeners: (() => void) | null = null
  let removeInitialDisplayLoadListener: (() => void) | null = null

  const clearRevealListeners = () => {
    if (!removeRevealListeners) return
    removeRevealListeners()
    removeRevealListeners = null
  }
  const clearInitialDisplayLoadListener = () => {
    if (!removeInitialDisplayLoadListener) return
    removeInitialDisplayLoadListener()
    removeInitialDisplayLoadListener = null
  }

  let handleInitialDisplayLoad: (() => void) | null = null
  if (isExternalImageSource(blurredPlaceholderSource)) {
    const onInitialDisplayLoad = () => {
      if (cancelled) return
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return

      hideSpinner()
      clearInitialDisplayLoadListener()
    }

    handleInitialDisplayLoad = onInitialDisplayLoad
    image.addEventListener("load", onInitialDisplayLoad)
    removeInitialDisplayLoadListener = () => {
      image.removeEventListener("load", onInitialDisplayLoad)
    }
  }

  image.setAttribute(
    "src",
    isExternalImageSource(blurredPlaceholderSource)
      ? blurredPlaceholderSource
      : EXTERNAL_IMAGE_PLACEHOLDER_SRC
  )
  setExternalImageState(image, "loading")

  if (handleInitialDisplayLoad && getImageElementLoadState(image) === "loaded") {
    handleInitialDisplayLoad()
  }

  const revealSource = (state: ExternalImageState) => {
    if (cancelled) return
    if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return

    const onImageReady = () => {
      if (cancelled) return
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return

      clearRevealListeners()
      clearInitialDisplayLoadListener()
      hideSpinner()
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)
      stopPlaceholderSizingSync()
      clearExternalImagePlaceholderSizing(image)
      setExternalImageState(image, state)
    }

    image.addEventListener("load", onImageReady)
    image.addEventListener("error", onImageReady)
    removeRevealListeners = () => {
      image.removeEventListener("load", onImageReady)
      image.removeEventListener("error", onImageReady)
    }

    image.setAttribute("src", loadSource)

    const currentImageLoadState = getImageElementLoadState(image)
    if (
      currentImageLoadState === "loaded" ||
      (state === "error" && currentImageLoadState === "error")
    ) {
      onImageReady()
    }
  }

  loader.onload = () => {
    cacheExternalImageDimensions({
      width: loader.naturalWidth,
      height: loader.naturalHeight,
      sources: placeholderCandidates
    })
    syncPlaceholderSizing()
    revealSource("loaded")
  }

  loader.onerror = () => {
    revealSource("error")
  }

  loader.src = loadSource

  return () => {
    cancelled = true
    stopPlaceholderSizingSync()
    loader.onload = null
    loader.onerror = null
    clearRevealListeners()
    clearInitialDisplayLoadListener()
    hideSpinner()

    if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) === token) {
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR)
      clearExternalImagePlaceholderSizing(image)
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
  image.removeAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR)
  image.removeAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR)

  const figure = getBuilderImageFigure(image)
  if (figure instanceof HTMLElement) {
    figure.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR)
    figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR)
  }

  const container = getExternalImageContainer(image)
  if (container instanceof HTMLElement) {
    container.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR)
  }
}
